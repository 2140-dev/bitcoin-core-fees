import { BitcoinCoreAPI } from './api';

describe('BitcoinCoreAPI', () => {
  let api: BitcoinCoreAPI;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    api = new BitcoinCoreAPI('http://test-api:5001');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should fetch fee estimate', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ feerate: 0.0001, blocks: 2 }),
    });

    const result = await api.getFeeEstimate(2, 'economical', 2, 'main');
    expect(fetchMock).toHaveBeenCalledWith('http://test-api:5001/fees/2/economical/2?chain=main', undefined);
    expect(result.feerate).toBe(0.0001);
  });

  it('should fetch block count', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ blockcount: 800000 }),
    });

    const result = await api.getBlockCount();
    expect(fetchMock).toHaveBeenCalledWith('http://test-api:5001/blockcount', undefined);
    expect(result.blockcount).toBe(800000);
  });

  it('should handle fetch errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    await expect(api.getBlockCount()).rejects.toThrow('API error: status=500');
  });
});
