import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import LogsScreen from '../app/(tabs)/logs';
import { useChildStore } from '../store/childStore';
import { supabase } from '../lib/supabase';

jest.mock('../store/childStore', () => ({
  useChildStore: jest.fn(),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

type SupabaseQueryMock = {
  select: jest.Mock;
  eq: jest.Mock;
  gte: jest.Mock;
  lt: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
};

const createQuery = () => {
  const query = {} as SupabaseQueryMock;
  query.select = jest.fn(() => query);
  query.eq = jest.fn(() => query);
  query.gte = jest.fn(() => query);
  query.lt = jest.fn(() => query);
  query.order = jest.fn(() => query);
  query.limit = jest.fn(async () => ({ data: [], error: null }));

  return query;
};

describe('LogsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useChildStore as unknown as jest.Mock).mockReturnValue({
      activeChild: {
        id: 'child-1',
        name: '하린',
        birthdate: '2025-01-15',
        gender: 'female',
        photo_url: null,
        user_id: 'user-1',
        created_at: '2025-01-15T00:00:00.000Z',
      },
    });
    (supabase.from as jest.Mock).mockImplementation(() => createQuery());
  });

  it('전체 탭에서 추가 버튼을 누르면 기록 종류 선택 모달을 보여야 한다', async () => {
    const { getByLabelText, getByText } = render(<LogsScreen />);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalled();
    });

    fireEvent.press(getByLabelText('기록 추가'));

    expect(getByText('어떤 기록을 추가할까요?')).toBeTruthy();
    expect(getByLabelText('수유 기록 추가')).toBeTruthy();
    expect(getByLabelText('수면 기록 추가')).toBeTruthy();
    expect(getByLabelText('기저귀 기록 추가')).toBeTruthy();
    expect(getByLabelText('투약 기록 추가')).toBeTruthy();
    expect(getByLabelText('체온 기록 추가')).toBeTruthy();
    expect(getByLabelText('병원 기록 추가')).toBeTruthy();
    expect(getByLabelText('증상 기록 추가')).toBeTruthy();
  });

});
