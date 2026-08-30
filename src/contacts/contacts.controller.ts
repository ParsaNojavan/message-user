import { Controller } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RPCContext } from '@app/contracts/utils/crossCuttingConcerns/decorators/rpc-context.decorator';
import Context from '@app/contracts/models/dtos/rpcContext';

@Controller('contacts')
export class ContactsController {
    constructor(private readonly contactService: ContactsService) { }

    @MessagePattern('contact.add')
    async usersDetails(@Payload() data: {
        query: string,
        customFirstName: string,
        customLastName: string,
    }, @RPCContext() context) {

        return await this.contactService.addContact(
            data.query,
            data.customFirstName,
            data.customLastName,
            context
        );
    }

    @MessagePattern('contacts.list')
    async handleListContacts(
        @Payload()
        data: {
            search?: string;
            cursor?: string;
            limit?: number;
        },
        @RPCContext() context
    ) {
        const { search, cursor, limit = 20 } = data;
        return this.contactService.listContacts(search, cursor, limit, context);
    }

    @MessagePattern('contacts.edit')
    async handleEditContact(
        @Payload() payload: { contactUserId: string; data: any },
        @RPCContext() context
    ) {
        return this.contactService.editContact(
            context.sub,
            payload.contactUserId,
            payload.data
        );
    }

    @MessagePattern('contacts.remove')
    async handleRemoveContact(
        @Payload() payload: { contactUserId: string },
        @RPCContext() context
    ) {

        return this.contactService.removeContact(
            context.sub,
            payload.contactUserId
        );
    }
}
