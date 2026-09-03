import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CustomFieldsService,
  isEntityType,
  type CustomFieldDef,
  type EntityType,
} from './custom-fields.service';

/** Plain body shapes — interfaces so ValidationPipe passes custom keys through. */
export interface CreateCustomFieldBody {
  entity_type?: unknown;
  key?: unknown;
  label?: unknown;
  field_type?: unknown;
  custom_field?: unknown;
  options?: unknown;
  position?: unknown;
}

export interface UpdateCustomFieldBody {
  label?: unknown;
  custom_field?: unknown;
  options?: unknown;
  position?: unknown;
  [key: string]: unknown;
}

const UPDATE_KEYS = new Set(['label', 'custom_field', 'options', 'position']);

/** Text coercion without Object stringification ([object Object]). */
function optText(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v) ?? '';
}

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/custom-fields')
export class CustomFieldsController {
  constructor(private readonly customFields: CustomFieldsService) {}

  @Get()
  list(@Query('entity') entity?: string): { defs: CustomFieldDef[] } {
    if (entity !== undefined && !isEntityType(entity)) {
      throw new BadRequestException('Invalid entity');
    }
    return {
      defs: this.customFields.listDefs(entity),
    };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: CreateCustomFieldBody): { def: CustomFieldDef } {
    const def = this.customFields.createDef({
      entity_type: body.entity_type as EntityType,
      key: optText(body.key ?? '') ?? '',
      label: optText(body.label ?? '') ?? '',
      field_type: optText(body.field_type),
      custom_field: optText(body.custom_field),
      options:
        body.options !== undefined && typeof body.options === 'object'
          ? (body.options as Record<string, unknown>)
          : undefined,
      position:
        typeof body.position === 'number' && Number.isInteger(body.position)
          ? body.position
          : undefined,
    });
    return { def };
  }

  @Put(':id')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateCustomFieldBody,
  ): { def: CustomFieldDef } {
    for (const key of Object.keys(body ?? {})) {
      if (!UPDATE_KEYS.has(key)) {
        throw new BadRequestException(
          `Only label, custom_field, options and position can be updated (got "${key}"). Key and field_type are immutable.`,
        );
      }
    }
    const def = this.customFields.updateDef(id, {
      label: optText(body.label),
      custom_field: optText(body.custom_field),
      options:
        body.options !== undefined && typeof body.options === 'object'
          ? (body.options as Record<string, unknown>)
          : undefined,
      position:
        typeof body.position === 'number' && Number.isInteger(body.position)
          ? body.position
          : undefined,
    });
    if (!def) throw new NotFoundException('not_found');
    return { def };
  }

  @Delete(':id')
  delete(@Param('id') id: string): { ok: boolean } {
    if (!this.customFields.deleteDef(id))
      throw new NotFoundException('not_found');
    return { ok: true };
  }
}
