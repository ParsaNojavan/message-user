import { BadRequestException, ConflictException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import User, { UserDocument } from 'src/models/concrete/user';
import { Model, Types } from 'mongoose';
import Contact, { ContactDocument } from 'src/models/concrete/contacts';
import Context from '@app/contracts/models/dtos/rpcContext';
import DataResultDto from '@app/contracts/models/dtos/dataResultDto';

@Injectable()
export class ContactsService {

    constructor(
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        @InjectModel(Contact.name) private contactModel: Model<ContactDocument>,
    ) { }

    async addContact(
        query: string,
        customFirstName: string,
        customLastName: string,
        context: Context
    ): Promise<DataResultDto<any>> {

        const userId = context.sub;
        const cleanQuery = query.trim();

        const targetUser = await this.userModel.findOne({
            $or: [
                { phoneNumber: cleanQuery },
                { username: cleanQuery },
                { email: cleanQuery }
            ]
        })
            .select('_id firstName lastName')
            .lean();

        if (!targetUser) {
            throw new NotFoundException("user does not exist");
        }

        if (targetUser._id.toString() === userId) {
            throw new BadRequestException("you can't add yourself to contacts");
        }

        try {
            const newContact = await this.contactModel.create({
                userId: new Types.ObjectId(userId),
                contactUserId: targetUser._id,
                customFirstName: customFirstName || targetUser.firstName,
                customLastName: customLastName || targetUser.lastName
            });

            return {
                success: true,
                statusCode: HttpStatus.CREATED,
                message: 'contact.created',
                data: {
                    contact: newContact
                }
            };
        } catch (err: any) {

            if (err.code === 11000) {
                throw new ConflictException("user already in contacts");
            }
            throw err;
        }
    }

    

}

