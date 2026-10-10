-- =====================================================================
-- Base de datos: taller_confeccion_db
-- Sistema de gestion para talleres de confeccion de prendas
-- Motor: MySQL 8.0+  (InnoDB, utf8mb4)
--
-- =====================================================================

DROP DATABASE IF EXISTS taller_confeccion_db;
CREATE DATABASE taller_confeccion_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE taller_confeccion_db;

-- ---------------------------------------------------------------------
-- Tabla: TALLER
-- Cada taller es el lugar fisico donde se afilian administradores
-- locales y sastres, y al que pertenecen las prendas confeccionadas.
-- ---------------------------------------------------------------------
CREATE TABLE taller (
    taller_id       INT AUTO_INCREMENT,
    nombre          VARCHAR(100) NOT NULL,
    direccion       VARCHAR(200) NULL,
    fecha_registro  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_taller PRIMARY KEY (taller_id),
    CONSTRAINT uq_taller_nombre UNIQUE (nombre)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Tabla: USUARIO
-- Un unico usuario cubre los 4 roles del sistema (RF-12):
-- cliente, admin_local, super_admin, sastre.
-- Reglas de negocio (RF-06, prototipo):
--   - cliente y super_admin NO se afilian a un taller (taller_id NULL).
--   - admin_local y sastre SI deben tener taller_id.
--   - registrado_por deja trazabilidad de quien creo la cuenta
--     (super_admin crea admin_local; admin_local crea sastre).
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
    usuario_id          INT AUTO_INCREMENT,
    nombres             VARCHAR(100) NOT NULL,
    apellidos           VARCHAR(100) NOT NULL,
    cedula              VARCHAR(20)  NOT NULL,
    fecha_nacimiento    DATE NOT NULL,
    correo              VARCHAR(150) NOT NULL,
    contrasena_hash     VARCHAR(255) NOT NULL,
    rol                 ENUM('cliente','admin_local','super_admin','sastre') NOT NULL,
    taller_id           INT NULL,
    registrado_por      INT NULL,
    estado              ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
    fecha_registro      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_usuario PRIMARY KEY (usuario_id),
    CONSTRAINT uq_usuario_cedula UNIQUE (cedula),
    CONSTRAINT uq_usuario_correo UNIQUE (correo),
    CONSTRAINT fk_usuario_taller
        FOREIGN KEY (taller_id) REFERENCES taller (taller_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_usuario_registrado_por
        FOREIGN KEY (registrado_por) REFERENCES usuario (usuario_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_usuario_taller_por_rol CHECK (
        (rol IN ('admin_local','sastre') AND taller_id IS NOT NULL)
        OR
        (rol IN ('cliente','super_admin') AND taller_id IS NULL)
    )
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Tabla: MEDIDAS_CORPORALES
-- Medidas del cliente (RF-04: actualizadas por el propio cliente,
-- RF-07: registradas manualmente por un administrador/sastre).
-- Dato sensible -> se cifra a nivel de aplicacion (RNF-05).
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
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_medidas_valor_positivo CHECK (valor > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Tabla: PRENDA
-- tipo_prenda alimenta la logica de combinaciones en el front (JS):
-- faldas/pantalones se combinan con blusas, vestidos no se combinan.
-- confeccionado_por = sastre que la armo. solicitado_por = cliente que
-- la pidio (solo si es_personalizada = TRUE); una prenda de catalogo
-- generica (ej. un polo) puede no tener solicitante.
-- taller_id: cada prenda pertenece a un unico taller (quien la hizo).
-- ---------------------------------------------------------------------
CREATE TABLE prenda (
    prenda_id           INT AUTO_INCREMENT,
    nombre              VARCHAR(100) NOT NULL,
    tipo_prenda         ENUM('falda','pantalon','blusa','vestido','polo','chaqueta','calzado','otro') NOT NULL,
    material            VARCHAR(100) NULL,
    color               VARCHAR(50) NULL,
    precio              DECIMAL(10,2) NOT NULL,
    taller_id           INT NOT NULL,
    confeccionado_por   INT NULL,
    solicitado_por      INT NULL,
    es_personalizada    BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_prenda PRIMARY KEY (prenda_id),
    CONSTRAINT fk_prenda_taller
        FOREIGN KEY (taller_id) REFERENCES taller (taller_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_prenda_confeccionado_por
        FOREIGN KEY (confeccionado_por) REFERENCES usuario (usuario_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_prenda_solicitado_por
        FOREIGN KEY (solicitado_por) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT chk_prenda_precio_positivo CHECK (precio >= 0),
    CONSTRAINT chk_prenda_personalizada_solicitante CHECK (
        (es_personalizada = FALSE) OR
        (es_personalizada = TRUE AND solicitado_por IS NOT NULL)
    )
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Tabla: PATRON
-- Cada prenda puede tener uno o varios patrones de corte, uno por
-- talla disponible (RF-08).
-- ---------------------------------------------------------------------
CREATE TABLE patron (
    patron_id           INT AUTO_INCREMENT,
    prenda_id           INT NOT NULL,
    talla               VARCHAR(20) NOT NULL,
    archivo_pdf         VARCHAR(255) NULL,
    generado_por        INT NULL,
    fecha_generacion    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_patron PRIMARY KEY (patron_id),
    CONSTRAINT fk_patron_prenda
        FOREIGN KEY (prenda_id) REFERENCES prenda (prenda_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_patron_generado_por
        FOREIGN KEY (generado_por) REFERENCES usuario (usuario_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT uq_patron_prenda_talla UNIQUE (prenda_id, talla)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Tabla: PATRON_MEDIDA
-- Modelo atributo-valor: una prenda puede requerir 4 medidas y otra
-- alrededor de 20, sin necesidad de rediseñar la estructura de la
-- tabla PATRON. Esta es la solucion relacional al problema que
-- originalmente motivaba el uso de MongoDB (numero variable de
-- campos por tipo de prenda).
-- ---------------------------------------------------------------------
CREATE TABLE patron_medida (
    patron_medida_id    INT AUTO_INCREMENT,
    patron_id           INT NOT NULL,
    nombre_medida       VARCHAR(50) NOT NULL,
    valor               DECIMAL(6,2) NOT NULL,
    unidad              VARCHAR(10) NOT NULL DEFAULT 'cm',
    CONSTRAINT pk_patron_medida PRIMARY KEY (patron_medida_id),
    CONSTRAINT fk_patron_medida_patron
        FOREIGN KEY (patron_id) REFERENCES patron (patron_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_patron_medida_nombre UNIQUE (patron_id, nombre_medida),
    CONSTRAINT chk_patron_medida_valor_positivo CHECK (valor > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Tabla: PEDIDO
-- Encabezado del pedido de un cliente. estado es el estado visible
-- para el cliente (RF-11); fecha_actualizacion permite que el front
-- detecte cambios recientes de estado sin necesidad de una tabla de
-- notificaciones.
-- gestionado_por = admin_local o sastre que acepto/gestiona el pedido.
-- ---------------------------------------------------------------------
CREATE TABLE pedido (
    pedido_id           INT AUTO_INCREMENT,
    cliente_id          INT NOT NULL,
    estado              ENUM('solicitado','aceptado','rechazado','en_produccion','terminado','entregado') NOT NULL DEFAULT 'solicitado',
    fecha_solicitud     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    gestionado_por      INT NULL,
    costo_total         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    CONSTRAINT pk_pedido PRIMARY KEY (pedido_id),
    CONSTRAINT fk_pedido_cliente
        FOREIGN KEY (cliente_id) REFERENCES usuario (usuario_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_pedido_gestionado_por
        FOREIGN KEY (gestionado_por) REFERENCES usuario (usuario_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_pedido_costo_no_negativo CHECK (costo_total >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Tabla: DETALLE_PEDIDO
-- Contenido del pedido: una o varias prendas (RF-01, RF-02, RF-10).
-- asignado_a / estado_confeccion permiten repartir un mismo pedido
-- entre varios sastres cuando contiene varias prendas, evitando que
-- dos sastres confeccionen la misma prenda por error.
-- ---------------------------------------------------------------------
CREATE TABLE detalle_pedido (
    detalle_id          INT AUTO_INCREMENT,
    pedido_id           INT NOT NULL,
    prenda_id           INT NOT NULL,
    cantidad            INT NOT NULL DEFAULT 1,
    subtotal            DECIMAL(10,2) NOT NULL,
    asignado_a          INT NULL,
    estado_confeccion   ENUM('pendiente','asignado','en_proceso','terminado') NOT NULL DEFAULT 'pendiente',
    CONSTRAINT pk_detalle_pedido PRIMARY KEY (detalle_id),
    CONSTRAINT fk_detalle_pedido_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedido (pedido_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_detalle_pedido_prenda
        FOREIGN KEY (prenda_id) REFERENCES prenda (prenda_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_detalle_pedido_asignado_a
        FOREIGN KEY (asignado_a) REFERENCES usuario (usuario_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_detalle_cantidad_positiva CHECK (cantidad > 0),
    CONSTRAINT chk_detalle_subtotal_no_negativo CHECK (subtotal >= 0)
) ENGINE=InnoDB;

-- =====================================================================
-- Indices adicionales para consultas frecuentes
-- =====================================================================
CREATE INDEX idx_usuario_rol ON usuario (rol);
CREATE INDEX idx_prenda_solicitado_por ON prenda (solicitado_por);
CREATE INDEX idx_prenda_taller ON prenda (taller_id);
CREATE INDEX idx_pedido_cliente ON pedido (cliente_id);
CREATE INDEX idx_pedido_estado ON pedido (estado);
CREATE INDEX idx_detalle_asignado_a ON detalle_pedido (asignado_a);
