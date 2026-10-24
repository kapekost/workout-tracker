import { useQuery } from '@tanstack/react-query';

import { api } from '../api';
import { planQueryOptions } from './plan';

export const usePlan = () => useQuery(planQueryOptions(api));
