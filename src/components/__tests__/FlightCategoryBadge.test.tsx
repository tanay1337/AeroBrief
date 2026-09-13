import { render } from '@testing-library/react-native';
import React from 'react';
import { FlightCategoryBadge } from '../FlightCategoryBadge';

describe('FlightCategoryBadge', () => {
  it('exposes the category to screen readers without relying on color', async () => {
    const screen = await render(<FlightCategoryBadge category="IFR" />);
    expect(screen.getByLabelText('Flight category IFR')).toBeTruthy();
    expect(screen.getByText('IFR')).toBeTruthy();
  });

  it('can be centered inside a TAF column', async () => {
    const screen = await render(<FlightCategoryBadge category="MVFR" centered />);
    expect(screen.getByLabelText('Flight category MVFR')).toHaveStyle({ alignSelf: 'center' });
  });
});
