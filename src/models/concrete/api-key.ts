import { Document, Types } from "mongoose"
import IEntity from "@app/contracts/models/abstract/iEntity"
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"

@Schema({ timestamps: true })
export default class APIKey extends Document implements IEntity {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    @Prop({ required: true, trim: true })
    title: string;

    @Prop({ required: true })
    allowedDomain: string;

    @Prop({ default: true })
    isActive: boolean;
}

export type APIKeyDocument = APIKey & Document & {
    createdAt: Date;
};

export const APIKeySchema = SchemaFactory.createForClass(APIKey);