/**
 * RequestFormScreen — обёртка над единой формой AddRequestScreen.
 * Маршрут `RequestFormScreen` (из хаба и deep links) теперь рендерит
 * ту же единую форму, что и `AddRequest` из чата заявок.
 * Вся логика (черновик, срочность, детали, отправка) живёт в Dobavit-Zayavku.tsx.
 */
import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import AddRequestScreen from './Dobavit-Zayavku';

const RequestFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  return <AddRequestScreen navigation={navigation} />;
};

export default RequestFormScreen;
