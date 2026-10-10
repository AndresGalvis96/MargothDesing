import { Router } from 'express';
import * as controller from '../controllers/clientes.controller.js';

const router = Router();

router.get('/', controller.listar);
router.get('/:id', controller.obtener);
router.post('/', controller.crear);
router.delete('/:id', controller.eliminar);

export default router;
