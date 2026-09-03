import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  Product,
  ProductBody,
  ProductListQuery,
} from './products.dto';

export type { Product, ProductBody, ProductListQuery };

export const PRODUCT_TYPES = ['product', 'service', 'other'] as const;

const PRODUCT_KEY_RE = /^[a-z][a-z0-9_-]*$/;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

@Injectable()
export class ProductsService {
  constructor(private readonly database: DatabaseService) {}

  list(query: ProductListQuery): { products: Product[] } {
    const search = str(query.search);
    const where: string[] = [];
    const params: unknown[] = [];
    if (search) {
      where.push('(name LIKE ? OR key LIKE ? OR notes LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const whereSQL = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
    const rows = this.database.sqlite
      .prepare(
        `SELECT * FROM products${whereSQL} ORDER BY name ASC, key ASC`,
      )
      .all(...params) as Product[];
    return { products: rows };
  }

  create(body: ProductBody): Product {
    const name = str(body.name);
    if (!name) throw new BadRequestException('Name is required');
    const rawKey = str(body.key);
    const key = rawKey || slugify(name);
    if (!PRODUCT_KEY_RE.test(key)) {
      throw new BadRequestException(
        `Invalid product key "${key}" — use lowercase letters, digits, underscores, and hyphens (must start with a letter).`,
      );
    }
    const type = body.type === undefined ? 'product' : str(body.type);
    if (!(PRODUCT_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(
        `Unknown type "${type}". Valid: ${PRODUCT_TYPES.join(', ')}`,
      );
    }
    if (this.find(key)) {
      throw new ConflictException(`Product "${key}" already exists`);
    }
    const now = new Date().toISOString();
    this.database.sqlite
      .prepare(
        'INSERT INTO products (key, name, type, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(key, name, type, str(body.status), str(body.notes), now, now);
    const inserted = this.find(key);
    if (!inserted) throw new BadRequestException('Failed to create product');
    return inserted;
  }

  update(key: string, body: ProductBody): Product {
    const existing = this.find(key);
    if (!existing) throw new NotFoundException('not_found');
    if (body.key !== undefined) {
      throw new BadRequestException('Product key is immutable');
    }
    const fields: string[] = [];
    const params: unknown[] = [];
    if (body.name !== undefined) {
      const name = str(body.name);
      if (!name) throw new BadRequestException('Name cannot be empty');
      fields.push('name = ?');
      params.push(name);
    }
    if (body.type !== undefined) {
      const type = str(body.type);
      if (!(PRODUCT_TYPES as readonly string[]).includes(type)) {
        throw new BadRequestException(
          `Unknown type "${type}". Valid: ${PRODUCT_TYPES.join(', ')}`,
        );
      }
      fields.push('type = ?');
      params.push(type);
    }
    if (body.status !== undefined) {
      fields.push('status = ?');
      params.push(str(body.status));
    }
    if (body.notes !== undefined) {
      fields.push('notes = ?');
      params.push(str(body.notes));
    }
    if (fields.length === 0)
      throw new BadRequestException('No fields to update');
    fields.push('updated_at = ?');
    params.push(new Date().toISOString(), key);
    this.database.sqlite
      .prepare(`UPDATE products SET ${fields.join(', ')} WHERE key = ?`)
      .run(...params);
    const updated = this.find(key);
    if (!updated) throw new NotFoundException('not_found');
    return updated;
  }

  remove(key: string): { ok: boolean } {
    if (!this.find(key)) throw new NotFoundException('not_found');
    const deals = this.database.sqlite
      .prepare('SELECT COUNT(*) as count FROM deals WHERE product_id = ?')
      .get(key) as { count: number };
    const subs = this.database.sqlite
      .prepare(
        'SELECT COUNT(*) as count FROM subscriptions WHERE product_id = ?',
      )
      .get(key) as { count: number };
    const refs = (deals?.count ?? 0) + (subs?.count ?? 0);
    if (refs > 0) {
      throw new ConflictException(
        `Product "${key}" is referenced by ${refs} deal(s)/subscription(s). Move them to another product first.`,
      );
    }
    this.database.sqlite
      .prepare('DELETE FROM products WHERE key = ?')
      .run(key);
    return { ok: true };
  }

  /** Null when missing — also used to validate deal/subscription writes. */
  find(key: string): Product | undefined {
    return this.database.sqlite
      .prepare('SELECT * FROM products WHERE key = ?')
      .get(key) as Product | undefined;
  }
}
