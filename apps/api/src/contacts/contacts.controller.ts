import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { Contact, ContactBody, ContactListQuery } from './contacts.dto';
import { ContactsService } from './contacts.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(
    @Query()
    query: ContactListQuery,
  ): { contacts: Contact[]; total: number; page: number; limit: number } {
    return this.contacts.list(query ?? {});
  }

  @Get(':id')
  get(@Param('id') id: string): { contact: Contact } {
    return { contact: this.contacts.get(id) };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: ContactBody): { contact: Contact } {
    return { contact: this.contacts.create(body ?? {}) };
  }

  @Put(':id')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: ContactBody,
  ): { contact: Contact } {
    return { contact: this.contacts.update(id, body ?? {}) };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return this.contacts.remove(id);
  }
}
