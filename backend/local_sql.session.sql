-- =====================================================================
-- Base de datos: taller_confeccion_db  (VERSION 2)
-- Sistema de Gestion de Confeccion y Patrones Digitales
-- Motor: MySQL 8.0+ (InnoDB, utf8mb4)
--
-- NOTA ACADEMICA: el RNF-09 original indicaba MongoDB. Por motivos
-- academicos el gestor se modifico a MySQL. La necesidad de medidas de
-- patron con numero variable de campos se resuelve con PATRON_MEDIDA
-- (modelo atributo-valor).
--
-- CONVENCIONES
--  * Datos personales (nombres, apellidos, cedula, correo, fecha de
--    nacimiento) se guardan CIFRADOS (AES-256-GCM, en la aplicacion)
--    en columnas VARBINARY. correo_hash y cedula_hash son huellas
--    HMAC-SHA256 (hex, 64 caracteres) para buscar/evitar duplicados.
--  * Borrado logico: nada se elimina fisicamente en usuario, empleado,
--    prenda y material (columnas eliminado_por / eliminado_en).
--  * Las columnas usadas en un CHECK no pueden tener acciones
--    referenciales CASCADE/SET NULL (error MySQL 3823); por eso las
--    llaves foraneas hacia USUARIO usan RESTRICT.
--  * Aislamiento entre talleres: llaves foraneas compuestas
--    (id, taller_id) impiden mezclar prendas, materiales y pedidos de
--    talleres distintos.
-- =====================================================================

DROP DATABASE IF EXISTS taller_confeccion_db;
CREATE DATABASE taller_confeccion_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE taller_confeccion_db;

-- ---------------------------------------------------------------------
-- TALLER: unidad de aislamiento (multi-taller). slug = subdominio o
-- ruta (central.sistema.com o /t/central); dominio_personalizado es
-- opcional por si un taller paga su propio dominio.
-- ---------------------------------------------------------------------
CREATE TABLE taller (
    taller_id                   INT AUTO_INCREMENT,
    nombre                      VARCHAR(100) NOT NULL,
    slug                        VARCHAR(60)  NOT NULL,
    dominio_personalizado       VARCHAR(150) NULL,
    direccion                   VARCHAR(200) NULL,
    telefono                    VARCHAR(20)  NULL,
    rol_receptor                ENUM('admin_local','supervisor') NOT NULL DEFAULT 'admin_local',
    alerta_umbral_pendientes    SMALLINT UNSIGNED NOT NULL DEFAULT 10,
    alertas_dia_pocos           TINYINT UNSIGNED  NOT NULL DEFAULT 3,
    alertas_dia_muchos          TINYINT UNSIGNED  NOT NULL DEFAULT 1,
    estado                      ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
    creado_en                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_taller PRIMARY KEY (taller_id),
    CONSTRAINT uq_taller_nombre UNIQUE (nombre),
    CONSTRAINT uq_taller_slug UNIQUE (slug),
    CONSTRAINT uq_taller_dominio UNIQUE (dominio_personalizado),
    CONSTRAINT chk_taller_slug CHECK (slug REGEXP '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT chk_taller_alertas CHECK (
        alerta_umbral_pendientes >= 1 AND alertas_dia_pocos >= 1 AND alertas_dia_muchos >= 1
    )
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- USUARIO: cuentas con acceso al sistema (correo + contrasena).
-- Roles: cliente, operario, supervisor, admin_local, super_admin.
-- Cadena de administracion: operario -> supervisor -> admin_local
-- (jefe_id); el super_admin administra todo.
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
    usuario_id                  INT AUTO_INCREMENT,
    nombres_cifrado             VARBINARY(512) NOT NULL,
    apellidos_cifrado           VARBINARY(512) NOT NULL,
    cedula_cifrada              VARBINARY(256) NOT NULL,
    cedula_hash                 CHAR(64) NOT NULL,
    correo_cifrado              VARBINARY(512) NOT NULL,
    correo_hash                 CHAR(64) NOT NULL,
    fecha_nacimiento_cifrada    VARBINARY(128) NOT NULL,
    contrasena_hash             VARCHAR(255) NOT NULL,
    correo_verificado           BOOLEAN NOT NULL DEFAULT FALSE,
    rol                         ENUM('cliente','operario','supervisor','admin_local','super_admin') NOT NULL,
    taller_id                   INT NULL,
    jefe_id                     INT NULL,
    estado                      ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
    intentos_fallidos           TINYINT UNSIGNED NOT NULL DEFAULT 0,
    bloqueado_hasta             DATETIME NULL,
    creado_por                  INT NULL,
    creado_en                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_por             INT NULL,
    actualizado_en              DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    eliminado_por               INT NULL,
    eliminado_en                DATETIME NULL,
    CONSTRAINT pk_usuario PRIMARY KEY (usuario_id),
    CONSTRAINT uq_usuario_cedula_hash UNIQUE (cedula_hash),
    CONSTRAINT uq_usuario_correo_hash UNIQUE (correo_hash),
    CONSTRAINT fk_usuario_taller
        FOREIGN KEY (taller_id) REFERENCES taller (taller_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_usuario_jefe
        FOREIGN KEY (jefe_id) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_usuario_creado_por
        FOREIGN KEY (creado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_usuario_actualizado_por
        FOREIGN KEY (actualizado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_usuario_eliminado_por
        FOREIGN KEY (eliminado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_usuario_taller_por_rol CHECK (
        (rol IN ('operario','supervisor','admin_local') AND taller_id IS NOT NULL)
        OR
        (rol IN ('cliente','super_admin') AND taller_id IS NULL)
    ),
    CONSTRAINT chk_usuario_jefe_por_rol CHECK (
        rol IN ('operario','supervisor','admin_local') OR jefe_id IS NULL
    )
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- EMPLEADO: personal del taller SIN acceso a la plataforma (aseo,
-- reparacion, etc.). Solo se registra para control interno.
-- ---------------------------------------------------------------------
CREATE TABLE empleado (
    empleado_id         INT AUTO_INCREMENT,
    taller_id           INT NOT NULL,
    nombres_cifrado     VARBINARY(512) NOT NULL,
    apellidos_cifrado   VARBINARY(512) NOT NULL,
    cedula_cifrada      VARBINARY(256) NOT NULL,
    cedula_hash         CHAR(64) NOT NULL,
    cargo               VARCHAR(60) NOT NULL,
    fecha_ingreso       DATE NULL,
    jefe_id             INT NULL,
    estado              ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
    creado_por          INT NULL,
    creado_en           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_por     INT NULL,
    actualizado_en      DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    eliminado_por       INT NULL,
    eliminado_en        DATETIME NULL,
    CONSTRAINT pk_empleado PRIMARY KEY (empleado_id),
    CONSTRAINT uq_empleado_taller_cedula UNIQUE (taller_id, cedula_hash),
    CONSTRAINT fk_empleado_taller
        FOREIGN KEY (taller_id) REFERENCES taller (taller_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_empleado_jefe
        FOREIGN KEY (jefe_id) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_empleado_creado_por
        FOREIGN KEY (creado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_empleado_actualizado_por
        FOREIGN KEY (actualizado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_empleado_eliminado_por
        FOREIGN KEY (eliminado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- MEDIDAS_CORPORALES: medidas del cliente (RF-04, RF-07). Se conserva
-- el historial; la vigente es la mas reciente de cada tipo_medida.
-- registrado_por NULL = la registro el propio cliente.
-- ---------------------------------------------------------------------
CREATE TABLE medidas_corporales (
    medida_id       INT AUTO_INCREMENT,
    usuario_id      INT NOT NULL,
    tipo_medida     VARCHAR(50) NOT NULL,
    valor           DECIMAL(6,2) NOT NULL,
    unidad          VARCHAR(10) NOT NULL DEFAULT 'cm',
    registrado_por  INT NULL,
    fecha_registro  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_medidas_corporales PRIMARY KEY (medida_id),
    CONSTRAINT fk_medidas_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuario (usuario_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_medidas_registrado_por
        FOREIGN KEY (registrado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_medidas_valor_positivo CHECK (valor > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- IMAGEN: tabla generica de imagenes (prendas, solicitudes y futuras
-- funcionalidades). El archivo vive en disco/almacenamiento externo;
-- aqui solo se guarda la ruta y sus metadatos.
-- ---------------------------------------------------------------------
CREATE TABLE imagen (
    imagen_id       INT AUTO_INCREMENT,
    ruta            VARCHAR(500) NOT NULL,
    nombre_original VARCHAR(255) NULL,
    tipo_mime       VARCHAR(50)  NOT NULL,
    tamano_bytes    INT UNSIGNED NOT NULL,
    texto_alternativo VARCHAR(200) NULL,
    subida_por      INT NOT NULL,
    subida_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_imagen PRIMARY KEY (imagen_id),
    CONSTRAINT uq_imagen_ruta UNIQUE (ruta),
    CONSTRAINT fk_imagen_subida_por
        FOREIGN KEY (subida_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_imagen_tipo CHECK (tipo_mime IN ('image/jpeg','image/png','image/webp')),
    CONSTRAINT chk_imagen_tamano CHECK (tamano_bytes > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PRENDA: prendas del catalogo (es_personalizada = FALSE) y prendas
-- solicitadas a medida por un cliente (es_personalizada = TRUE, con
-- solicitado_por). tipo_prenda permite al front calcular combinaciones.
-- tarifa_mano_obra es opcional (estandar propio de cada taller).
-- ---------------------------------------------------------------------
CREATE TABLE prenda (
    prenda_id           INT AUTO_INCREMENT,
    taller_id           INT NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    descripcion         TEXT NULL,
    tipo_prenda         ENUM('falda','pantalon','blusa','vestido','polo','chaqueta','calzado','otro') NOT NULL,
    color               VARCHAR(50) NULL,
    calidad             ENUM('basica','estandar','premium') NOT NULL DEFAULT 'estandar',
    complejidad         ENUM('baja','media','alta') NOT NULL DEFAULT 'media',
    precio              DECIMAL(10,2) NULL,
    tarifa_mano_obra    DECIMAL(10,2) NULL,
    disponible          BOOLEAN NOT NULL DEFAULT TRUE,
    es_personalizada    BOOLEAN NOT NULL DEFAULT FALSE,
    solicitado_por      INT NULL,
    confeccionado_por   INT NULL,
    creado_por          INT NULL,
    creado_en           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_por     INT NULL,
    actualizado_en      DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    eliminado_por       INT NULL,
    eliminado_en        DATETIME NULL,
    CONSTRAINT pk_prenda PRIMARY KEY (prenda_id),
    CONSTRAINT uq_prenda_id_taller UNIQUE (prenda_id, taller_id),
    CONSTRAINT fk_prenda_taller
        FOREIGN KEY (taller_id) REFERENCES taller (taller_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_prenda_solicitado_por
        FOREIGN KEY (solicitado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_prenda_confeccionado_por
        FOREIGN KEY (confeccionado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_prenda_creado_por
        FOREIGN KEY (creado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_prenda_actualizado_por
        FOREIGN KEY (actualizado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_prenda_eliminado_por
        FOREIGN KEY (eliminado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_prenda_precio CHECK (precio IS NULL OR precio >= 0),
    CONSTRAINT chk_prenda_tarifa CHECK (tarifa_mano_obra IS NULL OR tarifa_mano_obra >= 0),
    CONSTRAINT chk_prenda_catalogo_con_precio CHECK (es_personalizada = TRUE OR precio IS NOT NULL),
    CONSTRAINT chk_prenda_solicitante CHECK (
        (es_personalizada = TRUE  AND solicitado_por IS NOT NULL)
        OR
        (es_personalizada = FALSE AND solicitado_por IS NULL)
    )
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PRENDA_IMAGEN: imagenes de una prenda (puente N:M con IMAGEN).
-- ---------------------------------------------------------------------
CREATE TABLE prenda_imagen (
    prenda_id       INT NOT NULL,
    imagen_id       INT NOT NULL,
    es_principal    BOOLEAN NOT NULL DEFAULT FALSE,
    orden           TINYINT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT pk_prenda_imagen PRIMARY KEY (prenda_id, imagen_id),
    CONSTRAINT fk_prenda_imagen_prenda
        FOREIGN KEY (prenda_id) REFERENCES prenda (prenda_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_prenda_imagen_imagen
        FOREIGN KEY (imagen_id) REFERENCES imagen (imagen_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- MATERIAL: telas, hilos, botones, ojaletes, cordones, cierres,
-- metales, cristales... propios de cada taller, con precio y stock.
-- ---------------------------------------------------------------------
CREATE TABLE material (
    material_id         INT AUTO_INCREMENT,
    taller_id           INT NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    categoria           ENUM('tela','hilo','boton','ojalete','cordon','cierre','metal','cristal','otro') NOT NULL,
    descripcion         VARCHAR(255) NULL,
    unidad              ENUM('metro','unidad','cono','gramo','par') NOT NULL,
    precio_unitario     DECIMAL(10,2) NOT NULL,
    stock_actual        DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock_minimo        DECIMAL(12,2) NOT NULL DEFAULT 0,
    creado_por          INT NULL,
    creado_en           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_por     INT NULL,
    actualizado_en      DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    eliminado_por       INT NULL,
    eliminado_en        DATETIME NULL,
    CONSTRAINT pk_material PRIMARY KEY (material_id),
    CONSTRAINT uq_material_id_taller UNIQUE (material_id, taller_id),
    CONSTRAINT uq_material_taller_nombre UNIQUE (taller_id, nombre),
    CONSTRAINT fk_material_taller
        FOREIGN KEY (taller_id) REFERENCES taller (taller_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_material_creado_por
        FOREIGN KEY (creado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_material_actualizado_por
        FOREIGN KEY (actualizado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_material_eliminado_por
        FOREIGN KEY (eliminado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_material_precio CHECK (precio_unitario >= 0),
    CONSTRAINT chk_material_stock CHECK (stock_actual >= 0 AND stock_minimo >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PRENDA_MATERIAL: ficha tecnica de la prenda (materiales que usa).
-- taller_id repetido + llaves compuestas = prenda y material siempre
-- del mismo taller.
-- ---------------------------------------------------------------------
CREATE TABLE prenda_material (
    prenda_id           INT NOT NULL,
    material_id         INT NOT NULL,
    taller_id           INT NOT NULL,
    cantidad_estimada   DECIMAL(10,2) NULL,
    nota                VARCHAR(150) NULL,
    CONSTRAINT pk_prenda_material PRIMARY KEY (prenda_id, material_id),
    CONSTRAINT fk_prenda_material_prenda
        FOREIGN KEY (prenda_id, taller_id) REFERENCES prenda (prenda_id, taller_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_prenda_material_material
        FOREIGN KEY (material_id, taller_id) REFERENCES material (material_id, taller_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_prenda_material_cantidad CHECK (cantidad_estimada IS NULL OR cantidad_estimada > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PATRON: patron de corte por prenda y talla (talla = texto libre).
-- El PDF/SVG se genera bajo demanda a partir de PATRON_MEDIDA;
-- plantilla_version identifica el algoritmo usado.
-- ---------------------------------------------------------------------
CREATE TABLE patron (
    patron_id           INT AUTO_INCREMENT,
    prenda_id           INT NOT NULL,
    talla               VARCHAR(20) NOT NULL,
    plantilla_version   VARCHAR(20) NOT NULL DEFAULT '1.0',
    generado_por        INT NULL,
    generado_en         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_patron PRIMARY KEY (patron_id),
    CONSTRAINT uq_patron_prenda_talla UNIQUE (prenda_id, talla),
    CONSTRAINT fk_patron_prenda
        FOREIGN KEY (prenda_id) REFERENCES prenda (prenda_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_patron_generado_por
        FOREIGN KEY (generado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PATRON_MEDIDA: medidas del patron (4, 20 o las que requiera la
-- prenda) sin cambiar la estructura de la tabla.
-- ---------------------------------------------------------------------
CREATE TABLE patron_medida (
    patron_medida_id    INT AUTO_INCREMENT,
    patron_id           INT NOT NULL,
    nombre_medida       VARCHAR(50) NOT NULL,
    valor               DECIMAL(6,2) NOT NULL,
    unidad              VARCHAR(10) NOT NULL DEFAULT 'cm',
    CONSTRAINT pk_patron_medida PRIMARY KEY (patron_medida_id),
    CONSTRAINT uq_patron_medida_nombre UNIQUE (patron_id, nombre_medida),
    CONSTRAINT fk_patron_medida_patron
        FOREIGN KEY (patron_id) REFERENCES patron (patron_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_patron_medida_valor CHECK (valor >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PEDIDO: solicitud/compra de un cliente dirigida a UN taller.
-- fecha_respuesta permite medir el tiempo de atencion.
-- ---------------------------------------------------------------------
CREATE TABLE pedido (
    pedido_id           INT AUTO_INCREMENT,
    cliente_id          INT NOT NULL,
    taller_id           INT NOT NULL,
    estado              ENUM('solicitado','aceptado','rechazado','en_produccion','terminado','entregado','cancelado') NOT NULL DEFAULT 'solicitado',
    prioridad           ENUM('baja','normal','alta') NOT NULL DEFAULT 'normal',
    fecha_solicitud     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    gestionado_por      INT NULL,
    fecha_respuesta     DATETIME NULL,
    motivo_rechazo      VARCHAR(255) NULL,
    costo_total         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    CONSTRAINT pk_pedido PRIMARY KEY (pedido_id),
    CONSTRAINT uq_pedido_id_taller UNIQUE (pedido_id, taller_id),
    CONSTRAINT fk_pedido_cliente
        FOREIGN KEY (cliente_id) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_pedido_taller
        FOREIGN KEY (taller_id) REFERENCES taller (taller_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_pedido_gestionado_por
        FOREIGN KEY (gestionado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_pedido_costo CHECK (costo_total >= 0),
    CONSTRAINT chk_pedido_rechazo_con_motivo CHECK (estado <> 'rechazado' OR motivo_rechazo IS NOT NULL),
    CONSTRAINT chk_pedido_gestionado CHECK (estado IN ('solicitado','cancelado') OR gestionado_por IS NOT NULL)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- DETALLE_PEDIDO: prendas del pedido (una o muchas). Cada item puede
-- asignarse a un operario distinto. descripcion = cuerpo de la
-- solicitud personalizada. Costo del item: materiales + mano de obra.
-- ---------------------------------------------------------------------
CREATE TABLE detalle_pedido (
    detalle_id          INT AUTO_INCREMENT,
    pedido_id           INT NOT NULL,
    taller_id           INT NOT NULL,
    prenda_id           INT NOT NULL,
    talla               VARCHAR(20) NULL,
    cantidad            INT NOT NULL DEFAULT 1,
    descripcion         TEXT NULL,
    costo_materiales    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    costo_mano_obra     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    subtotal            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    asignado_a          INT NULL,
    estado_confeccion   ENUM('pendiente','asignado','en_proceso','terminado') NOT NULL DEFAULT 'pendiente',
    iniciado_en         DATETIME NULL,
    terminado_en        DATETIME NULL,
    horas_trabajo       DECIMAL(6,2) NULL,
    CONSTRAINT pk_detalle_pedido PRIMARY KEY (detalle_id),
    CONSTRAINT uq_detalle_id_taller UNIQUE (detalle_id, taller_id),
    CONSTRAINT fk_detalle_pedido
        FOREIGN KEY (pedido_id, taller_id) REFERENCES pedido (pedido_id, taller_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_detalle_prenda
        FOREIGN KEY (prenda_id, taller_id) REFERENCES prenda (prenda_id, taller_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_detalle_asignado_a
        FOREIGN KEY (asignado_a) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_detalle_cantidad CHECK (cantidad > 0),
    CONSTRAINT chk_detalle_costos CHECK (costo_materiales >= 0 AND costo_mano_obra >= 0 AND subtotal >= 0),
    CONSTRAINT chk_detalle_horas CHECK (horas_trabajo IS NULL OR horas_trabajo >= 0),
    CONSTRAINT chk_detalle_asignacion CHECK (estado_confeccion = 'pendiente' OR asignado_a IS NOT NULL),
    CONSTRAINT chk_detalle_fechas CHECK (iniciado_en IS NULL OR terminado_en IS NULL OR terminado_en >= iniciado_en)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- DETALLE_PEDIDO_IMAGEN: imagenes de referencia (cliente) o de
-- resultado (taller) asociadas a un item del pedido.
-- ---------------------------------------------------------------------
CREATE TABLE detalle_pedido_imagen (
    detalle_id      INT NOT NULL,
    imagen_id       INT NOT NULL,
    tipo_imagen     ENUM('referencia','resultado') NOT NULL DEFAULT 'referencia',
    CONSTRAINT pk_detalle_pedido_imagen PRIMARY KEY (detalle_id, imagen_id),
    CONSTRAINT fk_dpi_detalle
        FOREIGN KEY (detalle_id) REFERENCES detalle_pedido (detalle_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_dpi_imagen
        FOREIGN KEY (imagen_id) REFERENCES imagen (imagen_id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- MOVIMIENTO_MATERIAL: kardex de materiales (entradas, consumos y
-- ajustes). El consumo lo registra el operario y descuenta el stock
-- (en transaccion, desde la aplicacion). Base de las auditorias.
-- ---------------------------------------------------------------------
CREATE TABLE movimiento_material (
    movimiento_id   INT AUTO_INCREMENT,
    taller_id       INT NOT NULL,
    material_id     INT NOT NULL,
    tipo            ENUM('entrada','consumo','ajuste_mas','ajuste_menos') NOT NULL,
    cantidad        DECIMAL(12,2) NOT NULL,
    costo_unitario  DECIMAL(10,2) NOT NULL,
    detalle_id      INT NULL,
    usuario_id      INT NOT NULL,
    fecha           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observacion     VARCHAR(255) NULL,
    CONSTRAINT pk_movimiento_material PRIMARY KEY (movimiento_id),
    CONSTRAINT fk_mov_material
        FOREIGN KEY (material_id, taller_id) REFERENCES material (material_id, taller_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_mov_detalle
        FOREIGN KEY (detalle_id, taller_id) REFERENCES detalle_pedido (detalle_id, taller_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_mov_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_mov_cantidad CHECK (cantidad > 0),
    CONSTRAINT chk_mov_costo CHECK (costo_unitario >= 0),
    CONSTRAINT chk_mov_consumo_con_detalle CHECK (tipo <> 'consumo' OR detalle_id IS NOT NULL)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PAGO: abonos/pagos de un pedido. 'pasarela' queda reservado para la
-- integracion futura; NUNCA se guardan datos de tarjeta.
-- ---------------------------------------------------------------------
CREATE TABLE pago (
    pago_id         INT AUTO_INCREMENT,
    pedido_id       INT NOT NULL,
    monto           DECIMAL(12,2) NOT NULL,
    metodo          ENUM('efectivo','tienda','transferencia','pasarela') NOT NULL,
    estado          ENUM('pendiente','confirmado','rechazado','reembolsado') NOT NULL DEFAULT 'pendiente',
    referencia      VARCHAR(100) NULL,
    registrado_por  INT NULL,
    fecha_pago      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_pago PRIMARY KEY (pago_id),
    CONSTRAINT fk_pago_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedido (pedido_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_pago_registrado_por
        FOREIGN KEY (registrado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_pago_monto CHECK (monto > 0),
    CONSTRAINT chk_pago_pasarela_referencia CHECK (metodo <> 'pasarela' OR referencia IS NOT NULL)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- AUDITORIA: historial de acciones (quien, que, cuando, antes/despues).
-- entidad + entidad_id es una referencia logica (sin FK) a cualquier
-- tabla auditada.
-- ---------------------------------------------------------------------
CREATE TABLE auditoria (
    auditoria_id    BIGINT AUTO_INCREMENT,
    usuario_id      INT NULL,
    taller_id       INT NULL,
    accion          ENUM('crear','editar','eliminar','restaurar','desactivar') NOT NULL,
    entidad         VARCHAR(50) NOT NULL,
    entidad_id      INT NOT NULL,
    detalle         JSON NULL,
    ip              VARCHAR(45) NULL,
    fecha           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_auditoria PRIMARY KEY (auditoria_id),
    CONSTRAINT fk_auditoria_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_auditoria_taller
        FOREIGN KEY (taller_id) REFERENCES taller (taller_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- =====================================================================
-- Indices para consultas frecuentes
-- =====================================================================
CREATE INDEX idx_usuario_rol_taller ON usuario (rol, taller_id);
CREATE INDEX idx_usuario_jefe ON usuario (jefe_id);
CREATE INDEX idx_medidas_usuario_tipo ON medidas_corporales (usuario_id, tipo_medida, fecha_registro);
CREATE INDEX idx_prenda_catalogo ON prenda (taller_id, es_personalizada, disponible);
CREATE INDEX idx_prenda_solicitado_por ON prenda (solicitado_por);
CREATE INDEX idx_material_taller_categoria ON material (taller_id, categoria);
CREATE INDEX idx_pedido_taller_estado ON pedido (taller_id, estado, fecha_solicitud);
CREATE INDEX idx_pedido_cliente ON pedido (cliente_id, fecha_solicitud);
CREATE INDEX idx_detalle_asignado ON detalle_pedido (asignado_a, estado_confeccion);
CREATE INDEX idx_detalle_pedido ON detalle_pedido (pedido_id);
CREATE INDEX idx_mov_material_fecha ON movimiento_material (material_id, fecha);
CREATE INDEX idx_mov_usuario_fecha ON movimiento_material (usuario_id, fecha);
CREATE INDEX idx_pago_pedido ON pago (pedido_id);
CREATE INDEX idx_auditoria_entidad ON auditoria (entidad, entidad_id);
CREATE INDEX idx_auditoria_taller_fecha ON auditoria (taller_id, fecha);

-- =====================================================================
-- Vistas para reportes (los nombres/correos estan cifrados: la
-- aplicacion los descifra al armar el reporte)
-- =====================================================================
CREATE VIEW vw_produccion_operario AS
SELECT d.taller_id,
       d.asignado_a                         AS operario_id,
       d.detalle_id,
       d.pedido_id,
       p.tipo_prenda,
       d.cantidad,
       d.costo_materiales,
       d.costo_mano_obra,
       d.iniciado_en,
       d.terminado_en,
       TIMESTAMPDIFF(MINUTE, d.iniciado_en, d.terminado_en) AS minutos_confeccion
FROM detalle_pedido d
JOIN prenda p ON p.prenda_id = d.prenda_id
WHERE d.estado_confeccion = 'terminado';

CREATE VIEW vw_consumo_material AS
SELECT m.taller_id,
       m.material_id,
       ma.nombre            AS material,
       ma.categoria,
       m.usuario_id         AS operario_id,
       m.detalle_id,
       m.cantidad,
       m.costo_unitario,
       (m.cantidad * m.costo_unitario) AS costo_total,
       m.fecha
FROM movimiento_material m
JOIN material ma ON ma.material_id = m.material_id
WHERE m.tipo = 'consumo';

CREATE VIEW vw_usuarios_registro_baja AS
SELECT usuario_id, rol, taller_id, jefe_id,
       creado_por, creado_en, eliminado_por, eliminado_en
FROM usuario;

CREATE VIEW vw_pedidos_pendientes AS
SELECT pedido_id, taller_id, cliente_id, prioridad, fecha_solicitud,
       TIMESTAMPDIFF(HOUR, fecha_solicitud, NOW()) AS horas_espera
FROM pedido
WHERE estado = 'solicitado';

CREATE VIEW vw_stock_bajo AS
SELECT material_id, taller_id, nombre, categoria, unidad, stock_actual, stock_minimo
FROM material
WHERE eliminado_en IS NULL AND stock_actual <= stock_minimo;

CREATE VIEW vw_ingresos AS
SELECT pe.taller_id, pa.pago_id, pa.pedido_id, pa.metodo, pa.monto, pa.fecha_pago
FROM pago pa
JOIN pedido pe ON pe.pedido_id = pa.pedido_id
WHERE pa.estado = 'confirmado';

CREATE VIEW vw_tiempos_atencion AS
SELECT pedido_id, taller_id, fecha_solicitud, fecha_respuesta,
       TIMESTAMPDIFF(MINUTE, fecha_solicitud, fecha_respuesta) AS minutos_hasta_respuesta
FROM pedido
WHERE fecha_respuesta IS NOT NULL;

