import { Router } from 'express';
import { QdcLicenzaFacadeController } from '../controllers/qdc-facade/QdcLicenzaFacadeController';
import { QdcColtureFacadeController } from '../controllers/qdc-facade/QdcColtureFacadeController';
import { QdcOperazioniCampoFacadeController } from '../controllers/qdc-facade/QdcOperazioniCampoFacadeController';
import { QdcOperazioniRegistroFacadeController } from '../controllers/qdc-facade/QdcOperazioniRegistroFacadeController';
import { QdcMagazzinoAgrofarmaciFacadeController } from '../controllers/qdc-facade/QdcMagazzinoAgrofarmaciFacadeController';
import { QdcMagazzinoFertilizzantiFacadeController } from '../controllers/qdc-facade/QdcMagazzinoFertilizzantiFacadeController';
import { QdcProdottiFertilizzantiFacadeController } from '../controllers/qdc-facade/QdcProdottiFertilizzantiFacadeController';
import { QdcStampeFacadeController } from '../controllers/qdc-facade/QdcStampeFacadeController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';

/**
 * Live Image Line QDC v2 facade used by the Seminai MCP connector.
 * All routes require the same session/JWT as the rest of the API.
 */
export function createQdcFacadeRouter(): Router {
  const router = Router();
  const licenza = new QdcLicenzaFacadeController();
  const colture = new QdcColtureFacadeController();
  const campo = new QdcOperazioniCampoFacadeController();
  const registro = new QdcOperazioniRegistroFacadeController();
  const agrofarmaci = new QdcMagazzinoAgrofarmaciFacadeController();
  const fertilizzanti = new QdcMagazzinoFertilizzantiFacadeController();
  const prodotti = new QdcProdottiFertilizzantiFacadeController();
  const stampe = new QdcStampeFacadeController();
  router.use(ensureAuthenticated);
  mountLicenza(router, licenza);
  mountColture(router, colture);
  mountOperazioni(router, campo, registro);
  mountMagazzino(router, agrofarmaci, fertilizzanti);
  mountProdotti(router, prodotti);
  mountStampe(router, stampe);
  return router;
}

function mountLicenza(router: Router, licenza: QdcLicenzaFacadeController): void {
  router.get(
    '/licenza/info',
    asyncHandler((req, res) => licenza.getLicenzaInfo(req, res)),
  );
  router.get(
    '/licenza/aziende',
    asyncHandler((req, res) => licenza.getAziende(req, res)),
  );
  router.get(
    '/licenza/aziende/:idAzienda',
    asyncHandler((req, res) => licenza.getAzienda(req, res)),
  );
  router.get(
    '/licenza/aziende/:idAzienda/scadenze',
    asyncHandler((req, res) => licenza.getScadenze(req, res)),
  );
  router.get(
    '/licenza/tecnici',
    asyncHandler((req, res) => licenza.getTecnici(req, res)),
  );
  router.get(
    '/licenza/associazioni',
    asyncHandler((req, res) => licenza.getAssociazioni(req, res)),
  );
  router.post(
    '/licenza/associazioni',
    asyncHandler((req, res) => licenza.setAssociazione(req, res)),
  );
  router.delete(
    '/licenza/associazioni',
    asyncHandler((req, res) => licenza.delAssociazione(req, res)),
  );
}

function mountColture(router: Router, colture: QdcColtureFacadeController): void {
  router.get(
    '/colture/unita',
    asyncHandler((req, res) => colture.getUnita(req, res)),
  );
  router.get(
    '/colture/conferimenti',
    asyncHandler((req, res) => colture.getConferimenti(req, res)),
  );
}

function mountOperazioni(
  router: Router,
  campo: QdcOperazioniCampoFacadeController,
  registro: QdcOperazioniRegistroFacadeController,
): void {
  router.get(
    '/operazioni/campo/:tipo',
    asyncHandler((req, res) => campo.getByTipo(req, res)),
  );
  router.get(
    '/operazioni/registro/:tipo',
    asyncHandler((req, res) => registro.getByTipo(req, res)),
  );
}

function mountMagazzino(
  router: Router,
  agrofarmaci: QdcMagazzinoAgrofarmaciFacadeController,
  fertilizzanti: QdcMagazzinoFertilizzantiFacadeController,
): void {
  router.get(
    '/magazzino/agrofarmaci/giacenze',
    asyncHandler((req, res) => agrofarmaci.getGiacenze(req, res)),
  );
  router.get(
    '/magazzino/agrofarmaci/carichi',
    asyncHandler((req, res) => agrofarmaci.getCarichi(req, res)),
  );
  router.post(
    '/magazzino/agrofarmaci/carichi',
    asyncHandler((req, res) => agrofarmaci.setCarico(req, res)),
  );
  router.delete(
    '/magazzino/agrofarmaci/carichi/:idCarico',
    asyncHandler((req, res) => agrofarmaci.delCarico(req, res)),
  );
  router.get(
    '/magazzino/agrofarmaci/resi',
    asyncHandler((req, res) => agrofarmaci.getResi(req, res)),
  );
  router.post(
    '/magazzino/agrofarmaci/resi',
    asyncHandler((req, res) => agrofarmaci.setReso(req, res)),
  );
  router.delete(
    '/magazzino/agrofarmaci/resi/:idReso',
    asyncHandler((req, res) => agrofarmaci.delReso(req, res)),
  );
  router.get(
    '/magazzino/fertilizzanti/giacenze',
    asyncHandler((req, res) => fertilizzanti.getGiacenze(req, res)),
  );
  router.get(
    '/magazzino/fertilizzanti/carichi',
    asyncHandler((req, res) => fertilizzanti.getCarichi(req, res)),
  );
  router.post(
    '/magazzino/fertilizzanti/carichi',
    asyncHandler((req, res) => fertilizzanti.setCarico(req, res)),
  );
  router.delete(
    '/magazzino/fertilizzanti/carichi/:idCarico',
    asyncHandler((req, res) => fertilizzanti.delCarico(req, res)),
  );
  router.get(
    '/magazzino/fertilizzanti/resi',
    asyncHandler((req, res) => fertilizzanti.getResi(req, res)),
  );
  router.post(
    '/magazzino/fertilizzanti/resi',
    asyncHandler((req, res) => fertilizzanti.setReso(req, res)),
  );
  router.delete(
    '/magazzino/fertilizzanti/resi/:idReso',
    asyncHandler((req, res) => fertilizzanti.delReso(req, res)),
  );
}

function mountProdotti(router: Router, prodotti: QdcProdottiFertilizzantiFacadeController): void {
  router.get(
    '/prodotti/fertilizzanti',
    asyncHandler((req, res) => prodotti.search(req, res)),
  );
  router.post(
    '/prodotti/fertilizzanti',
    asyncHandler((req, res) => prodotti.setNuovo(req, res)),
  );
  router.post(
    '/prodotti/fertilizzanti/abilita',
    asyncHandler((req, res) => prodotti.abilita(req, res)),
  );
  router.post(
    '/prodotti/fertilizzanti/codice',
    asyncHandler((req, res) => prodotti.assegnaCodice(req, res)),
  );
}

function mountStampe(router: Router, stampe: QdcStampeFacadeController): void {
  router.get(
    '/stampe/registro-trattamenti',
    asyncHandler((req, res) => stampe.getRegistroTrattamenti(req, res)),
  );
}
