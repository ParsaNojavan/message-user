import { Document, Types } from "mongoose"
import IEntity from "@app/contracts/models/abstract/iEntity"
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"

@Schema({ timestamps: true })
export default class Contact extends Document implements IEntity {
    @Prop({ type: Types.ObjectId, required: true, ref: 'User', index: true })
    userId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
    contactUserId: Types.ObjectId;

    @Prop({ required: false })
    customFirstName?: string;

    @Prop({ required: false })
    customLastName?: string;

}

export type ContactDocument = Contact & Document & {
    createdAt: Date;
    updatedAt: Date;
};

export const ContactSchema = SchemaFactory.createForClass(Contact);
ContactSchema.index({ userId: 1, contactUserId: 1 }, { unique: true });