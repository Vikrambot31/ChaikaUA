import { Place, PlaceType } from '../types/app';

export type MapFocusPlaceParams = {
  focusPlaceId: string;
  focusPlaceLat: number;
  focusPlaceLng: number;
  focusPlaceName: string;
  focusPlaceAddress: string;
  focusPlaceType: PlaceType;
};

export const getMapFocusPlaceParams = (place: Place): MapFocusPlaceParams => ({
  focusPlaceId: place.id,
  focusPlaceLat: place.latitude,
  focusPlaceLng: place.longitude,
  focusPlaceName: place.name,
  focusPlaceAddress: place.address,
  focusPlaceType: place.type,
});
