import type { SQLiteDatabase } from 'expo-sqlite';
import { getLogbookImageThumbnails } from '../logbookAttachments';

describe('logbook image thumbnails', () => {
  it('uses general flight images and excludes pre-flight material images', async () => {
    const db = {
      getAllAsync: jest.fn().mockResolvedValue([
        { flight_id: 'flight-1', uri: 'file:///flight-photo.jpg' }
      ])
    } as unknown as SQLiteDatabase;

    await expect(getLogbookImageThumbnails(db)).resolves.toEqual({
      'flight-1': 'file:///flight-photo.jpg'
    });
    expect((db.getAllAsync as jest.Mock).mock.calls[0]?.[0]).toContain("category = 'GENERAL'");
  });
});
