import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
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

@Injectable()
export class UserService {

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService) { }

  async login(userDto: UserLoginRegisterDto) {
    let user = await this.userModel.findOne({ email: userDto.email })
    console.log(user)

    if (!user) {
      throw new NotFoundException('user.get.not-found')
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
        console.log(verificationCode);
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

    if (!user.verified) {
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
      await user.save();
    }

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

}
