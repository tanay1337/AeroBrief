import { LOGBOOK_EXPORT_HEADERS, logbookToCsv, parseLogbookFile } from '@/data/logbookImport';

const encoder = new TextEncoder();

function columnName(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value & 255, value >>> 8 & 255]);
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]);
}

function join(chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function testWorkbook(rows: (string | number)[][]): Uint8Array {
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
    const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
    return typeof value === 'number'
      ? `<c r="${reference}"><v>${value}</v></c>`
      : `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
  }).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const name = encoder.encode('xl/worksheets/sheet1.xml');
  const body = encoder.encode(sheet);
  const local = join([uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(body.length), uint32(body.length), uint16(name.length), uint16(0), name, body]);
  const central = join([uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(body.length), uint32(body.length), uint16(name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(0), name]);
  const end = join([uint32(0x06054b50), uint16(0), uint16(0), uint16(1), uint16(1), uint32(central.length), uint32(local.length), uint16(0)]);
  return join([local, central, end]);
}

describe('logbook file import', () => {
  it('finds headers below a title row and distinguishes block time from air time', () => {
    const row = {
      Date: "01 Jan '26",
      'ACFT Type': 'Diamond DA20-A1 (MOGAS)',
      Callsign: 'D-TEST',
      Crew: 'Student / Instructor',
      from: 'EDAY',
      to: 'EDAY',
      Departure: '10:06',
      Landing: '11:13',
      BlockOff: '10:00',
      BlockOn: '11:18',
      Landings: 1,
      Airtime: '1:07',
      'Flight Time': '1:18',
      'Price Cat.': 'Training',
      Remarks: '# TEST-001',
      Track: '',
      'capzlog.aero': '',
      CloudLog: ''
    };
    const values = LOGBOOK_EXPORT_HEADERS.map((header) => row[header as keyof typeof row]);
    const data = testWorkbook([['Flightlog'], [...LOGBOOK_EXPORT_HEADERS], values]);

    const parsed = parseLogbookFile(data, 'Flightlog.xlsx', 'DUAL', 'DAY');

    expect(parsed.missingHeaders).toEqual([]);
    expect(parsed.flights).toHaveLength(1);
    expect(parsed.flights[0]).toMatchObject({
      date: '2026-01-01',
      callsign: 'D-TEST',
      crew: 'Student / Instructor',
      departureAirport: 'EDAY',
      arrivalAirport: 'EDAY',
      airtimeMinutes: 67,
      flightTimeMinutes: 78,
      dualMinutes: 78,
      landingsDay: 1,
      landingsNight: 0,
      remarks: '# TEST-001'
    });
    expect(parsed.flights[0]?.sourceRow).toBe(3);
  });

  it('calculates durations when the export omits its calculated duration cells', () => {
    const data = testWorkbook([[...LOGBOOK_EXPORT_HEADERS], [
      '2026-01-01', 'DA20', 'D-TEST', '', 'EDAY', 'EDAV', '23:50', '00:35', '23:40', '00:45',
      1, '', '', '', '', '', '', ''
    ]]);
    expect(parseLogbookFile(data, 'Flightlog.xlsx').flights[0]).toMatchObject({ airtimeMinutes: 45, flightTimeMinutes: 65 });
  });

  it('exports original interoperability fields plus EASA-oriented details', () => {
    const data = testWorkbook([[...LOGBOOK_EXPORT_HEADERS], [
      '2026-01-01', 'DA20', 'D-TEST', 'Student / Instructor', 'EDAY', 'EDAV', '10:06', '11:13', '10:00', '11:18',
      1, '1:07', '1:18', 'Training', '', 'track.gpx', 'capz', 'cloud'
    ]]);
    const flight = parseLogbookFile(data, 'Flightlog.xlsx').flights[0];
    expect(flight).toBeDefined();
    const csv = logbookToCsv([flight!]);
    expect(csv).toContain('capzlog.aero,CloudLog,PIC Name,Pilot Role');
    expect(csv).toContain('track.gpx,capz,cloud,,DUAL');
    const roundTrip = parseLogbookFile(new TextEncoder().encode(csv).buffer as ArrayBuffer, 'backup.csv', 'UNASSIGNED', 'REVIEW');
    expect(roundTrip.flights[0]).toMatchObject({ pilotRole: 'DUAL', flightTimeMinutes: 78, dualMinutes: 78, landingsDay: 1, landingsNight: 0 });
  });
});
