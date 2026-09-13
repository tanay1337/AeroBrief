import type { SQLiteDatabase } from 'expo-sqlite';
import { getLogbookFlights } from '../logbook';

describe('logbook list ordering', () => {
  it('puts drafts before completed flights on the same date', async () => {
    const getAllAsync = jest.fn().mockResolvedValue([]);
    await getLogbookFlights({ getAllAsync } as unknown as SQLiteDatabase);
    expect(getAllAsync).toHaveBeenCalledWith(expect.stringContaining("date DESC, CASE WHEN status = 'DRAFT' THEN 0 ELSE 1 END"));
  });
});
