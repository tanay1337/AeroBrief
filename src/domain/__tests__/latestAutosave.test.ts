import { LatestAutosave } from '@/domain/latestAutosave';

describe('route autosave queue', () => {
  beforeEach(() => jest.useFakeTimers()); afterEach(() => jest.useRealTimers());
  it('coalesces rapid edits and flushes immediately before leaving', async () => {
    const write = jest.fn().mockResolvedValue(undefined); const status = jest.fn();
    const queue = new LatestAutosave<number>(write, status);
    queue.enqueue(1); queue.enqueue(2); queue.enqueue(3);
    await queue.flush(); expect(write.mock.calls).toEqual([[3]]); expect(status).toHaveBeenLastCalledWith('saved');
    jest.runAllTimers(); expect(write).toHaveBeenCalledTimes(1);
  });
  it('serializes an edit made during a slow write and flush waits for the latest value', async () => {
    let release!: () => void;
    const write = jest.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; })).mockResolvedValue(undefined);
    const queue = new LatestAutosave<number>(write, jest.fn()); queue.enqueue(1);
    const flush = queue.flush(); queue.enqueue(2); queue.enqueue(3); release(); await flush;
    expect(write.mock.calls).toEqual([[1], [3]]);
  });
  it('retains failed edits for retry and reports failure instead of a saved state', async () => {
    const write = jest.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined); const status = jest.fn();
    const queue = new LatestAutosave<number>(write, status); queue.enqueue(7);
    await expect(queue.flush()).rejects.toThrow('disk'); expect(status).toHaveBeenLastCalledWith('error');
    await queue.flush(); expect(write.mock.calls).toEqual([[7], [7]]); expect(status).toHaveBeenLastCalledWith('saved');
  });
});

it('does not retry discarded edits after a failed local save', async () => {
  jest.useFakeTimers();
  const write = jest.fn().mockRejectedValue(new Error('disk')); const status = jest.fn();
  const queue = new LatestAutosave<number>(write, status); queue.enqueue(1);
  await expect(queue.flush()).rejects.toThrow('disk'); queue.discard();
  await queue.flush(); jest.runAllTimers(); expect(write).toHaveBeenCalledTimes(1);
  expect(status).toHaveBeenLastCalledWith('saved'); jest.useRealTimers();
});
