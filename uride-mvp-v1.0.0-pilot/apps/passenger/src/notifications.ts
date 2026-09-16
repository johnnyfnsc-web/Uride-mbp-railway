import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForUrRidePush(userId:string, apiRegister:(body:any)=>Promise<any>, appVariant:'PASSENGER'|'DRIVER') {
  const perms=await Notifications.getPermissionsAsync();
  let status=perms.status;
  if(status!=='granted'){
    const requested=await Notifications.requestPermissionsAsync();
    status=requested.status;
  }
  if(status!=='granted') return {registered:false,reason:'PERMISSION_DENIED'};
  if(Platform.OS==='android'){
    await Notifications.setNotificationChannelAsync('rides',{
      name:'Viajes URide',
      importance:Notifications.AndroidImportance.MAX,
      vibrationPattern:[0,250,120,250],
      sound:'default',
    });
  }
  const projectId=(Constants.expoConfig?.extra as any)?.eas?.projectId || (Constants as any).easConfig?.projectId;
  if(!projectId || projectId==='REPLACE_WITH_EAS_PROJECT_ID') return {registered:false,reason:'EAS_PROJECT_ID_REQUIRED'};
  const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
  await apiRegister({
    userId,
    expoPushToken:token,
    platform:Platform.OS==='ios'?'IOS':'ANDROID',
    appVariant,
  });
  return {registered:true,token};
}
