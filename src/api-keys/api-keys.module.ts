import { Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import User, { UserSchema } from 'src/models/concrete/user';
import APIKey, { APIKeySchema } from 'src/models/concrete/api-key';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: APIKey.name, schema: APIKeySchema }
    ]),
  ],
  providers: [ApiKeysService],
  controllers: [ApiKeysController]
})
export class ApiKeysModule { }
