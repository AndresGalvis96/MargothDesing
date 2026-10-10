import 'dotenv/config';
import app from './app.js';
import { testConnection } from './config/database.js';

const port = Number(process.env.PORT || 3000);

// Verifica la conexión antes de empezar a aceptar solicitudes.
try {
  await testConnection();
  app.listen(port, () => {
    console.log(`API disponible en http://localhost:${port}`);
  });
} catch (error) {
  console.error('No fue posible iniciar la API:', error.message);
  process.exit(1);
}
