import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Jobs: undefined;
  Matches: undefined;
  CvAnalysis: undefined;
  Applications: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  JobDetail: { jobId: number };
  Notifications: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};
