import { BadRequestException } from '@nestjs/common';

export function nullableReference(
  value: unknown,
  field: string,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.trim() !== value) {
    throw new BadRequestException(`${field} muss eine ID oder null sein.`);
  }
  return value;
}

export function nonnegativeAmount(value: unknown, field: string): number {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(number) || number < 0) {
    throw new BadRequestException(
      `${field} muss eine endliche, nicht negative Zahl sein.`,
    );
  }
  return number;
}

const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

export function validCurrency(value: unknown): string {
  if (typeof value !== 'string' || !CURRENCIES.has(value)) {
    throw new BadRequestException(
      'currency muss ein gültiger ISO-4217-Währungscode sein, zum Beispiel EUR.',
    );
  }
  return value;
}

export function validDate(value: unknown, field: string): string {
  if (value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(
      `${field} muss ein Datum im Format JJJJ-MM-TT sein.`,
    );
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`${field} enthält kein gültiges Datum.`);
  }
  return value;
}

export function validDateRange(start: string, end: string): void {
  if (start && end && end < start) {
    throw new BadRequestException('end_date darf nicht vor start_date liegen.');
  }
}
