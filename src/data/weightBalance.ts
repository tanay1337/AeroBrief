import type { SQLiteDatabase } from 'expo-sqlite';
import type { SavedWeightBalanceCalculation, WeightBalanceInput, WeightBalanceResult } from '@/domain/weightBalance';

interface CalculationRow { id: string; profile_id: string; profile_group_id: string; profile_revision: number; registration: string; title: string; calculation_date: string; input_json: string; result_json: string; logbook_flight_id: string | null; created_at: number; }

const fromRow = (row: CalculationRow): SavedWeightBalanceCalculation => ({
  id: row.id, profileId: row.profile_id, profileGroupId: row.profile_group_id, profileRevision: row.profile_revision,
  registration: row.registration, title: row.title, calculationDate: row.calculation_date,
  input: JSON.parse(row.input_json) as WeightBalanceInput, result: JSON.parse(row.result_json) as WeightBalanceResult,
  logbookFlightId: row.logbook_flight_id, createdAt: row.created_at
});

export async function getWeightBalanceCalculations(db: SQLiteDatabase): Promise<SavedWeightBalanceCalculation[]> {
  const rows = await db.getAllAsync<CalculationRow>('SELECT * FROM weight_balance_calculations ORDER BY calculation_date DESC, created_at DESC');
  return rows.map(fromRow);
}

export async function getWeightBalanceCalculation(db: SQLiteDatabase, id: string): Promise<SavedWeightBalanceCalculation | null> {
  const row = await db.getFirstAsync<CalculationRow>('SELECT * FROM weight_balance_calculations WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export async function getFlightWeightBalance(db: SQLiteDatabase, flightId: string): Promise<SavedWeightBalanceCalculation | null> {
  const row = await db.getFirstAsync<CalculationRow>('SELECT * FROM weight_balance_calculations WHERE logbook_flight_id = ?', flightId);
  return row ? fromRow(row) : null;
}

export async function saveWeightBalanceCalculation(db: SQLiteDatabase, calculation: Omit<SavedWeightBalanceCalculation, 'id' | 'createdAt' | 'logbookFlightId'>): Promise<string> {
  const now = Date.now();
  const id = `weight-balance-${now}-${Math.random().toString(36).slice(2, 9)}`;
  await db.runAsync(`INSERT INTO weight_balance_calculations (
    id, profile_id, profile_group_id, profile_revision, registration, title, calculation_date, input_json, result_json, logbook_flight_id, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`, id, calculation.profileId, calculation.profileGroupId, calculation.profileRevision,
  calculation.registration, calculation.title, calculation.calculationDate, JSON.stringify(calculation.input), JSON.stringify(calculation.result), now);
  return id;
}

export async function linkWeightBalanceToFlight(db: SQLiteDatabase, calculationId: string | null, flightId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE weight_balance_calculations SET logbook_flight_id = NULL WHERE logbook_flight_id = ?', flightId);
    if (!calculationId) return;
    const calculation = await db.getFirstAsync<{ logbook_flight_id: string | null }>('SELECT logbook_flight_id FROM weight_balance_calculations WHERE id = ?', calculationId);
    if (!calculation) throw new Error('The selected calculation no longer exists.');
    if (calculation.logbook_flight_id && calculation.logbook_flight_id !== flightId) throw new Error('This calculation is already attached to another flight.');
    await db.runAsync('UPDATE weight_balance_calculations SET logbook_flight_id = ? WHERE id = ?', flightId, calculationId);
  });
}

export async function deleteWeightBalanceCalculation(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM weight_balance_calculations WHERE id = ?', id);
}
