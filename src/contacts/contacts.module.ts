import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { MongooseModule } from '@nestjs/mongoose';
import User, { UserSchema } from 'src/models/concrete/user';
import Contact, { ContactSchema } from 'src/models/concrete/contacts';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Contact.name, schema: ContactSchema }
    ]),
    ClientsModule.register([
      {
        name: 'chat-client',
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: parseInt(process.env.REDIS_PORT ?? '6379')
        }
      }
    ]),
  ],
  controllers: [ContactsController],
  providers: [ContactsService]
})
export class ContactsModule { }
