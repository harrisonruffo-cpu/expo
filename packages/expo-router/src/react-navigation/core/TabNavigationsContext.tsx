'use client';

import { createContext } from 'react';

import type { ParamListBase } from '../routers';
import type { NavigationProp } from './types';

export const TabNavigationsContext = createContext<NavigationProp<ParamListBase>[]>([]);
