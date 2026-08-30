import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Joi from 'joi';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import User, { UserSchema } from './models/concrete/user';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { ContactsModule } from './contacts/contacts.module';
import Redis from 'ioredis';
import Contact, { ContactSchema } from './models/concrete/contacts';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(3000),
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        MONGO_STRING: Joi.string().required(),
        MONGO_DB_NAME: Joi.string().default('userdb')
      })
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: process.env.JWT_EXPIRATION as any
      },
      global: true
    }),
    ClientsModule.register([
      {
        name: 'notification-client',
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379')
        }
      }
    ]),
    MongooseModule.forRoot(process.env.MONGO_STRING?.toString() ?? '', { dbName: 'meesage_userdb' }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Contact.name, schema: ContactSchema }
    ]),
    ApiKeysModule,
    ContactsModule,
  ],
  controllers: [UserController],
  providers: [
    UserService,
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          username: configService.get<string>('REDIS_USERNAME'),
          password: configService.get<string>('REDIS_PASSWORD'),
        });
      },
      inject: [ConfigService]
    },
  ],
})
export class UserModule { }
