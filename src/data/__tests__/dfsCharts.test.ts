import { getDfsChartLinks } from '../dfsCharts';

describe('DFS chart permalink catalogue', () => {
  it('links EDAY directly to its VFR and IFR airport chapters', () => {
    expect(getDfsChartLinks('eday')).toEqual({
      vfr: 'https://aip.dfs.de/BasicVFR/pages/C01AD2.html',
      ifr: 'https://aip.dfs.de/BasicIFR/pages/C01CC3.html'
    });
  });

  it('returns no guessed URL for an airport absent from the official catalogue', () => {
    expect(getDfsChartLinks('ZZZZ')).toEqual({ vfr: undefined, ifr: undefined });
  });
});
