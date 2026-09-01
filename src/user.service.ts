import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import UserLoginRegisterDto from 'lib/contracts/src/models/dtos/user/user-login-register.dto';
import User, { UserDocument } from './models/concrete/user';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt'
import ms from 'ms';
import generateRandomId, { generateRandom } from '@app/contracts/utils/random/randomString';
import DataResultDto from '@app/contracts/models/dtos/dataResultDto';
import AccessTokenDto from '@app/contracts/models/dtos/accessToken.dto';
import { RPCContext } from '@app/contracts/utils/crossCuttingConcerns/decorators/rpc-context.decorator';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import ResetPasswordDto from '@app/contracts/models/dtos/user/reset-password.dto';
import Context from '@app/contracts/models/dtos/rpcContext';
import ResultDto from '@app/contracts/models/dtos/resultDto';
import { first } from 'rxjs';
import { UpdateUserDto } from '@app/contracts/models/dtos/user/user-update.dto';
import Redis from 'ioredis';
import { OtpChannel } from '@app/contracts/models/enums/otp-type';
import { formatToIranianE164 } from '@app/contracts/utils/number/phone-number';

@Injectable()
export class UserService {

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject('notification-client') private notificationClient: ClientProxy,
    private jwtService: JwtService) { }

  private async getLockTTL(phoneNumber: string): Promise<number> {
    const lockKey = `otp_lock:${phoneNumber}`;
    return await this.redis.ttl(lockKey);
  }

  async login(userDto: UserLoginRegisterDto): Promise<ResultDto> {
    userDto.phoneNumber = formatToIranianE164(userDto.phoneNumber);

    const lockTtl = await this.getLockTTL(userDto.phoneNumber);
    if (lockTtl > 0) {
      const minutesRemaining = Math.ceil(lockTtl / 60);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'user.login.too-many-failed-attempts',
          retryAfterSeconds: lockTtl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const cooldownKey = `otp_cooldown:${userDto.phoneNumber}`;
    const cooldownTtl = await this.redis.ttl(cooldownKey);

    if (cooldownTtl > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'user.login.code-cooldown-active',
          resendAfterSeconds: cooldownTtl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let user = await this.userModel.findOne({ phoneNumber: userDto.phoneNumber });

    if (!user) {
      user = await this.userModel.create({
        phoneNumber: userDto.phoneNumber,
        verified: false,
        passwordHash: generateRandomId(16),
        lang: userDto.lang,
      });
    }

    await this.redis.set(cooldownKey, '1', 'EX', 120);

    let verificationCode: string;

    verificationCode = generateRandom(false, true, 4);

    user.verificationCode = verificationCode;
    await user.save();

    this.notificationClient.emit('notification.send-otp', {
      channel: OtpChannel.SMS,
      recipient: userDto.phoneNumber,
      code: verificationCode,
    });

    return {
      success: true,
      message: 'user.code-sent',
      statusCode: HttpStatus.OK,
    };
  }

  async refreshToken(data: { refreshToken, lang?}): Promise<DataResultDto<AccessTokenDto | null>> {
    const refreshToken = data.refreshToken

    if (!refreshToken) {
      throw new BadRequestException(
        await 'user.refresh-token.failed'
      )
    }

    let decoded;
    try {
      decoded = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET
      });
    } catch (error) {
      throw new UnauthorizedException(
        'user.refresh-token.expired'
      )
    }

    const user = await this.userModel.findOne({
      _id: decoded.sub
    });


    if (!user) {
      throw new NotFoundException(
        'user.get.not-found'
      )
    }

    user.lang = data.lang || 'en'
    await user.save()

    const accessToken = await this.jwtService.signAsync(
      {
        claims: user.claims,
        sub: String(user._id),
        lang: user.lang ?? 'en'
      }
    );

    const expiresInMs = ms(process.env.JWT_EXPIRATION || '1h');
    const expiration = new Date(Date.now() + expiresInMs);


    const accessTokenDto: AccessTokenDto = {
      type: 'Bearer',
      token: accessToken,
      expiration: expiration
    };

    const res: DataResultDto<AccessTokenDto> = {
      success: true,
      statusCode: HttpStatus.OK,
      data: accessTokenDto,
      message: 'user.refresh-token.successfully'
    };

    return res;
  }


  async verifyCode(userDto: UserLoginRegisterDto): Promise<DataResultDto<AccessTokenDto>> {

    const phoneNumber = formatToIranianE164(userDto.phoneNumber);

    const lockTtl = await this.getLockTTL(phoneNumber);
    if (lockTtl > 0) {
      throw new HttpException({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'user.login.too-many-failed-attempts',
        retryAfterSeconds: lockTtl,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.userModel.findOne({
      phoneNumber: phoneNumber,
    }) as UserDocument;

    if (!user) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'user.not-found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!userDto.verificationCode) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'user.verify.code-required',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (user.verificationCode !== userDto.verificationCode) {
      const attemptsKey = `otp_attempts:${phoneNumber}`;
      const attempts = await this.redis.incr(attemptsKey);

      if (attempts === 1) {
        await this.redis.expire(attemptsKey, 300);
      }

      if (attempts >= 5) {
        await this.redis.set(`otp_lock:${phoneNumber}`, '1', 'EX', 900);
        await this.redis.del(attemptsKey);
      }

      throw new HttpException({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'user.verify.code-invalid',
      }, HttpStatus.FORBIDDEN);
    }

    await this.redis.del(`otp_attempts:${phoneNumber}`);
    await this.redis.del(`otp_cooldown:${phoneNumber}`);

    user.verified = true;
    user.verificationCode = undefined;
    await user.save();

    const accessToken = await this.jwtService.signAsync({
      sub: String(user._id),
      claims: user.claims,
      lang: user.lang,
    });

    const expiresInMs = ms(process.env.JWT_EXPIRATION || '1h');
    const expiration = new Date(Date.now() + expiresInMs);

    const refreshToken = await this.jwtService.signAsync({
      sub: String(user._id),
      claims: user.claims,
      lang: user.lang,
    }, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRATION || '1d' as any
    });

    const refreshExpiresInMs = ms(process.env.JWT_REFRESH_EXPIRATION || '1d');
    const refreshExpiration = new Date(Date.now() + refreshExpiresInMs);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'user.verify.successfully',
      data: {
        type: 'Bearer',
        token: accessToken,
        expiration: expiration,
        refreshToken: refreshToken,
        refreshExpiration: refreshExpiration
      }
    }
  }

  async userProfile(context: Context): Promise<DataResultDto<any>> {
    const user = await this.userModel.findById(context.sub);

    if (!user) throw new HttpException({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'user.not-found',
    }, HttpStatus.NOT_FOUND);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'user-profile.fetch.success',
      data: {
        userId: String(user._id),
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        email: user.email,
        photoUrl: user.photoUrl,
        roles: user.claims
      }
    }
  }

  async updateProfile(userDto: UpdateUserDto, context: Context) {
    const updates = Object.fromEntries(
      Object.entries(userDto).filter(([, v]) => v !== undefined),
    );

    console.log(updates)

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException('Nothing to update');
    }


    return this.userModel.findByIdAndUpdate(
      context.sub,
      { $set: updates },
      { new: true },
    );
  }

  async blockUser(blockedId: string, context: Context): Promise<DataResultDto<any>> {
    const userId = context.sub;

    if (blockedId === userId) {
      throw new BadRequestException('you can not block yourself');
    }

    const updatedUser = await this.userModel.findByIdAndUpdate(
      new Types.ObjectId(userId),
      { $addToSet: { blockedUsers: new Types.ObjectId(blockedId) } },
      { returnDocument: 'after' }
    );

    if (!updatedUser) throw new NotFoundException("user not found");


    const redisKey = `user:${userId}:blocks`;
    await this.redis.set(redisKey, JSON.stringify({
      userId: userId,
      blocked: updatedUser.blockedUsers
    }))

    await this.redis.publish(redisKey, JSON.stringify({
      userId: userId,
      blocked: blockedId
    }));

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'user.blocked.successfuly',
      data: {
        userId: userId,
        blocked: updatedUser.blockedUsers,

      }
    }
  }

  async usersDetails(userIds: string[]): Promise<DataResultDto<any>> {
    if (!userIds || userIds.length === 0) {
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Users fetched successfully',
        data: []
      }
    }

    const uniqueIds = Array.from(new Set(userIds)).filter((id) =>
      Types.ObjectId.isValid(id),
    );

    if (uniqueIds.length === 0) {
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'No valid user IDs provided',
        data: []
      }
    }

    const users = await this.userModel
      .find({
        _id: { $in: uniqueIds },
      })
      .select('_id firstName lastName username avatar isOnline lastSeen')
      .lean()
      .exec();

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Users fetched successfully',
      data: users,
    };
  }
}
