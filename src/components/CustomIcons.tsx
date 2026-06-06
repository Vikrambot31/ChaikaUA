import React from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

interface IconProps {
  size: number;
  color: string;
}

// Мегафон - термінова допомога
export const MegaphoneIcon: React.FC<IconProps> = ({ size, color }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Defs>
      <LinearGradient id="megaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor={color} stopOpacity="1" />
        <Stop offset="100%" stopColor={color} stopOpacity="0.7" />
      </LinearGradient>
    </Defs>
    {/* Основной рог */}
    <Path
      d="M 15 50 L 45 35 L 45 65 Z"
      fill="url(#megaGrad)"
      stroke={color}
      strokeWidth="2"
    />
    {/* Изогнутая часть */}
    <Path
      d="M 45 35 Q 65 25 75 30 L 75 70 Q 65 75 45 65"
      fill="none"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
    />
    {/* Волны звука */}
    <Path
      d="M 80 50"
      stroke={color}
      strokeWidth="2.5"
      fill="none"
      strokeLinecap="round"
    />
    <Circle cx="85" cy="50" r="3" fill={color} />
    <Circle cx="90" cy="50" r="3" fill={color} />
  </Svg>
);

// Карта - карта Чайки
export const MapIcon: React.FC<IconProps> = ({ size, color }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Defs>
      <LinearGradient id="mapGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor={color} stopOpacity="1" />
        <Stop offset="100%" stopColor={color} stopOpacity="0.7" />
      </LinearGradient>
    </Defs>
    {/* Карта - сложенная */}
    <Path
      d="M 25 30 L 50 20 L 75 30 L 75 60 Q 50 70 25 60 Z"
      fill="url(#mapGrad)"
      stroke={color}
      strokeWidth="2"
    />
    {/* Линии на карте */}
    <Path
      d="M 35 40 Q 50 35 65 45"
      stroke={color}
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
      opacity="0.6"
    />
    <Path
      d="M 40 50 L 60 55"
      stroke={color}
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
      opacity="0.6"
    />
    {/* Маркер/булавка */}
    <Circle cx="50" cy="45" r="3" fill={color} />
    {/* Загибы карты */}
    <Path
      d="M 50 20 L 50 35"
      stroke={color}
      strokeWidth="1.5"
      opacity="0.5"
    />
  </Svg>
);

// Треугольник предупреждения - проблемы ЖК
export const WarningIcon: React.FC<IconProps> = ({ size, color }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Defs>
      <LinearGradient id="warnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor={color} stopOpacity="1" />
        <Stop offset="100%" stopColor={color} stopOpacity="0.7" />
      </LinearGradient>
    </Defs>
    {/* Внешний треугольник */}
    <Path
      d="M 50 15 L 85 70 L 15 70 Z"
      fill="url(#warnGrad)"
      stroke={color}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    {/* Восклицательный знак - точка */}
    <Circle cx="50" cy="58" r="3.5" fill="white" />
    {/* Восклицательный знак - линия */}
    <Path
      d="M 50 35 L 50 50"
      stroke="white"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </Svg>
);

// Сумка/покупки - кращі місця
export const ShoppingBagIcon: React.FC<IconProps> = ({ size, color }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Defs>
      <LinearGradient id="bagGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor={color} stopOpacity="1" />
        <Stop offset="100%" stopColor={color} stopOpacity="0.7" />
      </LinearGradient>
    </Defs>
    {/*  CG:8 */}
    <Path
      d="M 35 25 Q 35 15 50 15 Q 65 15 65 25"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Основная сумка */}
    <Path
      d="M 35 25 L 32 40 Q 30 70 50 75 Q 70 70 68 40 L 65 25 Z"
      fill="url(#bagGrad)"
      stroke={color}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    {/* Лінії на сумці */}
    <Path
      d="M 42 30 L 40 65"
      stroke={color}
      strokeWidth="1.5"
      opacity="0.5"
    />
    <Path
      d="M 58 30 L 60 65"
      stroke={color}
      strokeWidth="1.5"
      opacity="0.5"
    />
    {/* Верхняя часть сумки */}
    <Path
      d="M 35 25 L 65 25"
      stroke={color}
      strokeWidth="2"
    />
  </Svg>
);

