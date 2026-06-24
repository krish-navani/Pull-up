// IMPORTANT: Background task must be imported FIRST before any other modules.
// TaskManager requires the task to be defined synchronously at app load time
// so the OS can invoke it when the app is suspended or killed.
import './utils/backgroundLocationTask';

import 'expo-router/entry';