import { useEffect, useState } from 'react';
import {
  BuildingRatingsByBuilding,
  subscribeBuildingRatings,
} from '../services/buildingRatingService';

export function useBuildingRatings() {
  const [ratings, setRatings] = useState<BuildingRatingsByBuilding>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    return subscribeBuildingRatings((nextRatings) => {
      setRatings(nextRatings);
      setLoading(false);
    }, (nextError) => {
      setError(nextError);
      setLoading(false);
    });
  }, []);

  return { ratings, loading, error };
}
