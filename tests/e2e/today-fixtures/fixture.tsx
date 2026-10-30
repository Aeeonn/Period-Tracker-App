import { render } from 'preact';
import type { SuppressionReason } from '../../../src/contracts/enums.ts';
import {
  SUPPRESSION_REASONS,
  TODAY_EMERGENCY_FIXTURE,
  TODAY_PREVIEW_FIXTURE,
  TODAY_SUPPRESSION_FIXTURES,
} from '../../../src/ui/screens/today/index.ts';
import { TodayScreen } from '../../../src/ui/screens/today/today-screen.tsx';

const params = new URLSearchParams(window.location.search);
const fixture = params.get('fixture');
const suppression = params.get('suppression');
const props =
  fixture === 'emergency'
    ? TODAY_EMERGENCY_FIXTURE
    : suppression !== null && (SUPPRESSION_REASONS as readonly string[]).includes(suppression)
      ? TODAY_SUPPRESSION_FIXTURES[suppression as SuppressionReason]
      : TODAY_PREVIEW_FIXTURE;
const root = document.getElementById('today-root');

if (root === null) throw new Error('Today fixture mount point is missing.');
render(<TodayScreen {...props} />, root);
