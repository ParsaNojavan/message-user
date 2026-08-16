import { Document, Types } from "mongoose"
import IEntity from "@app/contracts/models/abstract/iEntity"
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import * as bcrypt from 'bcrypt'

@Schema({ timestamps: true })
export default class User extends Document implements IEntity {
    @Prop()
    firstName: string
    @Prop()
    lastName: string
    @Prop({ unique: true })
    username: string
    @Prop({ unique: true })
    phoneNumber: string
    @Prop({ unique: true })
    email: string
    @Prop({ default: 'fa' })
    lang: string
    @Prop()
    photoUrl: string
    @Prop()
    passwordHash: string
    @Prop({ type: String })
    verificationCode: string | undefined
    @Prop({ type: Boolean })
    verified: boolean
    @Prop({ type: Date })
    lastRevoked: Date

    @Prop({ type: [String], default: ['user'] })
    claims: string[]

    @Prop({ type: Number })
    testLimit: number

    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }] })
    blockedUsers: string[];

}

export type UserDocument = User & Document & {
    createdAt: Date;
    updatedAt: Date;
};

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.pre('save', async function () {
    const user = this;

    if (!user.isModified('passwordHash')) return;

    const SALT_WORK_FACTOR = 12;

    try {
        const salt = await bcrypt.genSalt(SALT_WORK_FACTOR);
        user.passwordHash = await bcrypt.hash(user.passwordHash, salt);
    } catch (err) {
        throw err;
    }
});