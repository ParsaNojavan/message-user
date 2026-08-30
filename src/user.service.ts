import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import UserLoginRegisterDto from 'lib/contracts/src/models/dtos/user/user-login-register.dto';
import User, { UserDocument } from './models/concrete/user';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt'
import ms from 'ms';
import { generateRandom } from '@app/contracts/utils/random/randomString';
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

@Injectable()
export class UserService {

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject('notification-client') private notificationClient: ClientProxy,
    private jwtService: JwtService) { }

  async login(userDto: UserLoginRegisterDto) {
    let user = await this.userModel.findOne({ email: userDto.email })
    console.log(user)

    if (!user) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'user.get.not-found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!user.verified) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: 'auth.login.user-not-verified',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    console.log('user found!')

    if (!await bcrypt.compare(userDto.password, user.passwordHash)) {
      throw new ForbiddenException('auth.login.password-or-username-is-invalid')
    }

    console.log('password correct!')

    const accessToken = await this.jwtService.signAsync({
      sub: String(user._id),
      claims: user.claims,
      lang: user.lang,
    })

    const expiresInMs = ms(process.env.JWT_EXPIRATION || '1h');
    const expiration = new Date(Date.now() + expiresInMs);

    const refreshToken = await this.jwtService.signAsync({
      sub: String(user._id),
      claims: user.claims,
      lang: user.lang,
    }, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: (process.env.JWT_REFRESH_EXPIRATION || '1d') as any
    })

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


  async register(userDto: UserLoginRegisterDto) {
    const existingUser = await this.userModel.findOne({
      email: userDto.email,
    });

    if (existingUser) {
      if (existingUser.verified) {
        throw new ConflictException('auth.register.user-already-exists');
      } else {
        const verificationCode = generateRandom(false, true, 4);
        await this.userModel.updateOne(existingUser, {
          verificationCode: verificationCode,
        });

        this.notificationClient.emit('notification.send-otp', {
          channel: OtpChannel.EMAIL,
          recipient: userDto.email,
          code: verificationCode,
        });

        return {
          success: true,
          statusCode: HttpStatus.OK,
          message: 'user.code.sent',
        }
      }
    }

    const verificationCode = generateRandom(false, true, 4);
    console.log(verificationCode);


    await this.userModel.create({
      email: userDto.email,
      passwordHash: userDto.password,
      verificationCode: verificationCode,
      verified: false,
      claims: ['user'],
      lang: 'fa',
    });

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'user.code.sent',
    }
  }

  async verifyCode(userDto: UserLoginRegisterDto): Promise<DataResultDto<AccessTokenDto>> {

    const user = await this.userModel.findOne({
      email: userDto.email,
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

    if (user.verified)
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          message: 'user.user.verify.already-verified',
        },
        HttpStatus.CONFLICT,
      );

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
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: 'user.verify.code-invalid',
        },
        HttpStatus.FORBIDDEN,
      );
    }


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

  async resetPassword(resetPass: ResetPasswordDto, context: Context): Promise<ResultDto> {
    const user = await this.userModel.findById(context.sub)

    if (!user) throw new NotFoundException('user.get.not-found')

    if (resetPass.password !== resetPass.confirmPassword) throw new BadRequestException('user.reset-pass.not-same')

    user.passwordHash = resetPass.password
    await user.save()

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'user.reset-pass.successfully'
    }
  }

  async userProfile(context: Context): Promise<DataResultDto<any>> {
    const user = await this.userModel.findById(context.sub);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'user-profile.fetch.success',
      data: {
        userId: String(user?._id),
        username: user?.username,
        firstName: user?.firstName,
        lastName: user?.lastName,
        phoneNumber: user?.phoneNumber,
        email: user?.email,
        photoUrl: user?.photoUrl,
        roles: user?.claims
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
