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
import {
  ProductsService,
  type Product,
  type ProductBody,
  type ProductListQuery,
} from './products.service';

// Auth comes from the global APP_GUARD (contract §3) — no controller guard.
@Controller('v1/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: ProductListQuery): { products: Product[] } {
    return this.products.list(query ?? {});
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: ProductBody): { product: Product } {
    return { product: this.products.create(body ?? {}) };
  }

  @Put(':key')
  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body() body: ProductBody,
  ): { product: Product } {
    return { product: this.products.update(key, body ?? {}) };
  }

  @Delete(':key')
  remove(@Param('key') key: string): { ok: boolean } {
    return this.products.remove(key);
  }
}
