import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../redux/store';
import { fetchPlaces } from '../redux/slices/placesSlice';

export const usePlaces = () => {
  const dispatch = useDispatch<AppDispatch>();

  const loadPlaces = useCallback(async (force = false) => {
    await dispatch(fetchPlaces({ force }));
  }, [dispatch]);

  return {
    loadPlaces,
  };
};
