import { BadRequestException, ConflictException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import User, { UserDocument } from 'src/models/concrete/user';
import { Model, PipelineStage, Types } from 'mongoose';
import Contact, { ContactDocument } from 'src/models/concrete/contacts';
import Context from '@app/contracts/models/dtos/rpcContext';
import DataResultDto from '@app/contracts/models/dtos/dataResultDto';
import { RpcException } from '@nestjs/microservices';
import { NormalizeObjectId } from '@app/contracts/utils/mongoose/normalizeObjectId';
import ResultDto from '@app/contracts/models/dtos/resultDto';

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

    async listContacts(search, cursor, limit, context: Context)
        : Promise<DataResultDto<any>> {

        limit = Math.min(limit, 50);
        const userId = context.sub;
        const currentUserId = new Types.ObjectId(userId);

        const pipeline: PipelineStage[] = [];

        const initialMatch: Record<string, any> = { userId: currentUserId };

        if (cursor) {
            initialMatch._id = { $lt: new Types.ObjectId(cursor) };
        }

        pipeline.push({ $match: initialMatch });

        pipeline.push({ $sort: { _id: -1 } });

        pipeline.push(
            {
                $lookup: {
                    from: 'users',
                    localField: 'contactUserId',
                    foreignField: '_id',
                    as: 'contactUser',
                    pipeline: [
                        {
                            $project: {
                                username: 1,
                                phoneNumber: 1,
                                email: 1,
                                firstName: 1,
                                lastName: 1,
                                avatar: 1,
                            },
                        },
                    ],
                },
            },
            {
                $unwind: '$contactUser',
            }
        );

        if (search) {
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escapedSearch, 'i');

            pipeline.push({
                $match: {
                    $or: [
                        { customFirstName: searchRegex },
                        { customLastName: searchRegex },
                        { 'contactUser.username': searchRegex },
                        { 'contactUser.phoneNumber': searchRegex },
                        { 'contactUser.email': searchRegex },
                        { 'contactUser.firstName': searchRegex },
                        { 'contactUser.lastName': searchRegex },
                    ],
                },
            });
        }

        pipeline.push({ $limit: limit + 1 });

        const results = await this.contactModel.aggregate(pipeline);

        const hasNextPage = results.length > limit;
        if (hasNextPage) {
            results.pop();
        }

        const nextCursor =
            results.length > 0 ? results[results.length - 1]._id.toString() : null;

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'contacts.fetch.success',
            data: {
                items: results,
                pagination: {
                    nextCursor,
                    hasNextPage,
                    limit,
                },
            }
        };
    }

    async editContact(userId: string, contactUserId: string, updateData: { customFirstName?: string; customLastName?: string })
        : Promise<DataResultDto<any>> {
        const updatedContact = await this.contactModel.findOneAndUpdate(
            {
                userId: NormalizeObjectId.getObjectIdOrString(userId),
                contactUserId: NormalizeObjectId.getObjectIdOrString(contactUserId)
            },
            { $set: updateData },
            { new: true, lean: true }
        );

        if (!updatedContact) {
            throw new NotFoundException('contact not found');
        }

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'contact.updated.success',
            data: {
                updatedContact: updatedContact
            }
        };
    }

    async removeContact(userId: string, contactUserId: string)
        : Promise<ResultDto> {

        const deletedContact = await this.contactModel.findOneAndDelete({
            userId: NormalizeObjectId.getObjectIdOrString(userId),
            contactUserId: NormalizeObjectId.getObjectIdOrString(contactUserId)
        });

        if (!deletedContact) {
            throw new NotFoundException('contact not found');
        }

        return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'contact.deleted.success',
        };
    }

}

