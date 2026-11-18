import { createApp } from './app';
import { config } from './config';

createApp().listen(config.PORT, () => {
  console.log(`API escuchando en http://localhost:${config.PORT}`);
});