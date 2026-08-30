import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { MongooseModule } from '@nestjs/mongoose';
import User, { UserSchema } from 'src/models/concrete/user';
import Contact, { ContactSchema } from 'src/models/concrete/contacts';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Contact.name, schema: ContactSchema }
    ]),
  ],
  controllers: [ContactsController],
  providers: [ContactsService]
})
export class ContactsModule { }
