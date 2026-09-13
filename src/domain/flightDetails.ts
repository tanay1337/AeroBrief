export function validDepartureDate(value: string): boolean {
  return value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
}
export function validDepartureTime(value: string): boolean { return value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
