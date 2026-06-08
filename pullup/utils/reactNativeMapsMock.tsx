import React from 'react';
import { View } from 'react-native';

const MapView = React.forwardRef((props: any, ref: any) => {
  return <View {...props} ref={ref}>{props.children}</View>;
});

export const Marker = React.forwardRef((props: any, ref: any) => {
  return <View {...props} ref={ref}>{props.children}</View>;
});

export const Polyline = (props: any) => {
  return <View {...props} />;
};

export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = 'default';

export default MapView;
