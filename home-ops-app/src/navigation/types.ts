export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
  TaskDetail: { taskId: number };
  AddTask: undefined;
  ApplianceDetail: { applianceId: number };
  AddAppliance: undefined;
  AddWarranty: { applianceId: number };
  AddDocument: undefined;
  Export: undefined;
  Paywall: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Appliances: undefined;
  Documents: undefined;
  Settings: undefined;
};
