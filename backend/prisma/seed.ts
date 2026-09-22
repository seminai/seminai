import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { parse } from 'csv-parse';
import {
  Company,
  CompanyRole,
  Field,
  Job,
  JobCategory,
  LabelCategory,
  Machine,
  Prisma,
  PrismaClient,
  Product,
  ProductCategory,
  ProductionUnit,
  User,
  UserRole,
  Warehouse,
} from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createReadStream, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { resolvePrismaPgSsl } from '../src/infrastructure/repositories/prisma-pg-ssl';
import { seedSalesModule } from './seed/sales-seed';
import { seedSkillsMarketplace } from './seed/skills-seed';

const DEFAULT_PASSWORD = 'test20255';
const LABEL_MANAGER_PASSWORD = 'test2025';
const LABEL_EXTRACTION_BATCH_SIZE = 100;

interface ProductSeedSource {
  readonly registrationNumber: string;
  readonly productName: string;
  readonly legalEntity: string;
  readonly legalAddress: string;
  readonly administrativeStatus: string;
  readonly hazardIndications: string;
  readonly formulationCode: string;
  readonly formulationDescription: string;
  readonly activeSubstances: string;
  readonly productType: string;
}

interface SeededUsers {
  readonly admin: User;
  readonly labelManager: User;
  readonly operator: User;
}

interface CompaniesContext {
  readonly fruitCompany: Company;
  readonly mixedCompany: Company;
}

interface WarehouseContext {
  readonly warehouses: Warehouse[];
}

interface MachineContext {
  readonly machines: Machine[];
}

interface FieldContext {
  readonly fields: Field[];
}

interface ProductContext {
  readonly products: Product[];
}

interface JobContext {
  readonly jobs: Job[];
}

interface LabelExtractionCsvRow {
  readonly id: string;
  readonly productName: string;
  readonly registrationNumber: string;
  readonly sourceUrl: string;
  readonly label: string;
  readonly rawText: string;
  readonly extractionConfidence: string;
  readonly isVerified: string;
  readonly extractedFields: string;
  readonly errors: string;
  readonly qualityExtraction: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly category?: string;
}

interface FitosanitarioRaw {
  readonly num_registrazione: string;
  readonly denominazione_prodotto: string;
  readonly ragione_sociale: string;
  readonly indirizzo_sede_legale: string;
  readonly stato_amministrativo: string;
  readonly indicazioni_di_pericolo: string;
  readonly codice_formulazione: string;
  readonly descrizione_formulazione: string;
  readonly sostanze_attive: string;
}

const FITOSANITARI_PATH: string = path.resolve(
  process.cwd(),
  'dataset/fitosanitari/fts_06062025.json',
);
const LABEL_EXTRACTIONS_CSV_PATH: string = path.resolve(
  process.cwd(),
  'prisma/data_seed/LabelExtraction_rows.csv',
);
type JsonValue = Prisma.InputJsonValue;

function loadProductSourceData(): readonly ProductSeedSource[] {
  try {
    const raw = readFileSync(FITOSANITARI_PATH, { encoding: 'utf-8' });
    const all = JSON.parse(raw) as FitosanitarioRaw[];
    const allowed = all.filter((item) => {
      const status = (item.stato_amministrativo || '').toLowerCase();
      return status.includes('autorizzato') || status.includes('attivo');
    });
    const source = (allowed.length > 0 ? allowed : all).slice(0, 20);
    return source.map((item) => ({
      registrationNumber: item.num_registrazione,
      productName: item.denominazione_prodotto,
      legalEntity: item.ragione_sociale,
      legalAddress: item.indirizzo_sede_legale,
      administrativeStatus: item.stato_amministrativo,
      hazardIndications: item.indicazioni_di_pericolo,
      formulationCode: item.codice_formulazione,
      formulationDescription: item.descrizione_formulazione,
      activeSubstances: item.sostanze_attive,
      productType: 'Fitosanitario',
    }));
  } catch (error) {
    console.warn(
      '[SEED] Failed to load fitosanitari dataset, using fallback products:',
      error instanceof Error ? error.message : String(error),
    );
    const fallback: readonly ProductSeedSource[] = [
      {
        registrationNumber: '000001',
        productName: 'ENOVIT',
        legalEntity: 'SIPCAM S.P.A.',
        legalAddress: 'VIA CARROCCIO, 8 - 20123 MILANO',
        administrativeStatus: 'Revocato',
        hazardIndications: '-',
        formulationCode: 'DP',
        formulationDescription: 'POLVERE',
        activeSubstances: 'THIOPHANATE-METHYL',
        productType: 'Fungicide',
      },
      {
        registrationNumber: '000002',
        productName: 'CONTRAX STANGE',
        legalEntity: 'KEMIO',
        legalAddress: 'VIA M. PANTALEONI, 31 - 00191 ROMA',
        administrativeStatus: 'Revocato',
        hazardIndications: '-',
        formulationCode: 'PR',
        formulationDescription: 'BASTONCINO PER PIANTE',
        activeSubstances: 'WARFARIN',
        productType: 'Rodenticide',
      },
    ] as const;
    return fallback;
  }
}

const PRODUCT_SOURCE_DATA: readonly ProductSeedSource[] = loadProductSourceData();

class DatabaseSeeder {
  private readonly prisma: PrismaClient;
  private labelParseErrors: number = 0;
  private readonly maxLabelParseWarnings: number = 3;

  public constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  public async execute(): Promise<void> {
    console.log('Clearing database...');
    await this.clearDatabase();
    console.log('Creating seed data...');
    const users = await this.seedUsers();
    const companies = await this.seedCompanies({ users });

    const fruitMachineContext = await this.seedMachines({ companyId: companies.fruitCompany.id });
    const fruitWarehouseContext = await this.seedWarehouses({
      companyId: companies.fruitCompany.id,
    });
    const mixedWarehouseContext = await this.seedWarehouses({
      companyId: companies.mixedCompany.id,
    });

    const fruitFieldContext = await this.seedFruitFields({ companyId: companies.fruitCompany.id });
    const mixedFieldContext = await this.seedMixedFields({ companyId: companies.mixedCompany.id });

    const fruitProductionUnits = await this.seedFruitProductionUnits();
    const mixedProductionUnits = await this.seedMixedProductionUnits();

    await this.linkProductionUnitsToFields({
      productionUnits: fruitProductionUnits,
      fields: fruitFieldContext.fields,
    });
    await this.linkMixedProductionUnitsToFields({
      productionUnits: mixedProductionUnits,
      fields: mixedFieldContext.fields,
    });

    const productContext = await this.seedProducts({
      warehouses: [...fruitWarehouseContext.warehouses, ...mixedWarehouseContext.warehouses],
    });

    const jobContext = await this.seedJobs({
      productionUnits: fruitProductionUnits,
      machine: fruitMachineContext.machines[0],
      operatorId: users.operator.id,
    });

    await this.seedStocks({
      products: productContext.products,
      jobId: jobContext.jobs[0].id,
      companyId: companies.fruitCompany.id,
    });
    const salesContext = await seedSalesModule(this.prisma, {
      companyId: companies.fruitCompany.id,
      warehouses: fruitWarehouseContext.warehouses,
    });
    await this.seedLabelExtractions();

    const skillsContext = await seedSkillsMarketplace(this.prisma, {
      createdById: users.labelManager.id,
    });

    console.log('Database has been seeded. 🌱');
    console.log('[SEED] Login credentials:');
    console.log(`  - admin@seminai.demo / ${DEFAULT_PASSWORD}`);
    console.log(`  - admin@seminai.local / ${LABEL_MANAGER_PASSWORD}`);
    console.log(`  - operator@seminai.demo / ${DEFAULT_PASSWORD}`);
    console.log('[SEED] Seminai Fruit Farm sales demo:');
    console.log(`  - ${salesContext.harvestProducts.length} harvest products with stock`);
    console.log(`  - ${salesContext.customers.length} customers`);
    console.log(`  - draft order: ${salesContext.draftOrderId}`);
    console.log(`  - confirmed order: ${salesContext.confirmedOrderId}`);
    console.log(`  - delivery note: ${salesContext.deliveryNoteId}`);
    console.log(
      `[SEED] ${skillsContext.skillsCreated} public skills seeded in workspace "${skillsContext.workspace.slug}"`,
    );
  }

  private async clearDatabase(): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.skill.deleteMany(),
      this.prisma.ruleOnCompany.deleteMany(),
      this.prisma.ruleOnCrop.deleteMany(),
      this.prisma.rule.deleteMany(),
      this.prisma.workspaceInvitation.deleteMany(),
      this.prisma.workspaceMember.deleteMany(),
      this.prisma.companyOnWorkspace.deleteMany(),
      this.prisma.workspace.deleteMany(),
      this.prisma.labelExtraction.deleteMany(),
      this.prisma.stock.deleteMany(),
      this.prisma.deliveryNoteItem.deleteMany(),
      this.prisma.deliveryNote.deleteMany(),
      this.prisma.salesOrderItem.deleteMany(),
      this.prisma.salesOrder.deleteMany(),
      this.prisma.businessPartner.deleteMany(),
      this.prisma.job.deleteMany(),
      this.prisma.productionCycle.deleteMany(),
      this.prisma.productionUnitOnField.deleteMany(),
      this.prisma.productionUnit.deleteMany(),
      this.prisma.field.deleteMany(),
      this.prisma.product.deleteMany(),
      this.prisma.machine.deleteMany(),
      this.prisma.warehouse.deleteMany(),
      this.prisma.userOnCompany.deleteMany(),
      this.prisma.company.deleteMany(),
      this.prisma.patentino.deleteMany(),
      this.prisma.settings.deleteMany(),
      this.prisma.user.deleteMany(),
    ]);
  }

  private async seedUsers(): Promise<SeededUsers> {
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 8);
    const labelManagerPasswordHash = await bcrypt.hash(LABEL_MANAGER_PASSWORD, 8);

    const admin = await this.prisma.user.create({
      data: {
        email: 'admin@seminai.demo',
        password: passwordHash,
        name: 'Lucia',
        surname: 'Rossi',
        role: UserRole.ADMIN,
        emailVerified: true,
        phoneNumber: '+39020000001',
        credits: 50,
        settings: {
          create: [{ language: 'it-IT', qdcApiKey: 'qdc-demo', ifarmingApiKey: 'ifarming-demo' }],
        },
      },
    });

    const labelManager = await this.prisma.user.create({
      data: {
        email: 'admin@seminai.local',
        password: labelManagerPasswordHash,
        name: 'Francesco',
        surname: 'Mazzi',
        role: UserRole.ADMIN,
        emailVerified: true,
        phoneNumber: '+39020000002',
        credits: 99999999999,
        settings: { create: [{ language: 'it-IT' }] },
      },
    });

    const operator = await this.prisma.user.create({
      data: {
        email: 'operator@seminai.demo',
        password: passwordHash,
        name: 'Giulia',
        surname: 'Testa',
        role: UserRole.BASIC,
        emailVerified: true,
        phoneNumber: '+39020000003',
        credits: 20,
        settings: { create: [{ language: 'it-IT' }] },
        patentini: {
          create: [
            {
              type: 'Trattamenti fitosanitari',
              code: 'PAT-001',
              expiresAt: new Date('2027-12-31T00:00:00.000Z'),
              releaseAt: new Date('2022-01-10T00:00:00.000Z'),
              isActive: true,
            },
          ],
        },
      },
    });

    return { admin, labelManager, operator };
  }

  private async seedCompanies(params: { readonly users: SeededUsers }): Promise<CompaniesContext> {
    const fruitCompany = await this.prisma.company.create({
      data: {
        name: 'Seminai Fruit Farm',
        vatNumber: 'IT12345678901',
        cuaa: 'SMNFRM75A01H501Z',
        ownerId: params.users.admin.id,
        fiscalCode: 'SMNFRC75A01H501Z',
        nation: 'Italia',
        city: 'Parma',
        address: 'Strada Provinciale 15, 12',
        cap: '43121',
        email: 'info@seminai.demo',
        phoneNumber: '+390521000001',
        website: 'https://seminai.demo',
      },
    });

    const mixedCompany = await this.prisma.company.create({
      data: {
        name: 'Seminai Cereal & Forage Farm',
        vatNumber: 'IT98765432109',
        cuaa: 'SMNFRM80B02H501Z',
        ownerId: params.users.admin.id,
        fiscalCode: 'SMNFRM80B02H501Z',
        nation: 'Italia',
        city: 'Reggio Emilia',
        address: 'Strada Provinciale 7, 5',
        cap: '42121',
        email: 'info-cereal@seminai.demo',
        phoneNumber: '+390522000002',
        website: 'https://seminai-cereal.demo',
      },
    });

    await this.prisma.userOnCompany.createMany({
      data: [
        {
          companyId: fruitCompany.id,
          userId: params.users.labelManager.id,
          role: CompanyRole.ADMIN,
          type: 'Agronomist',
        },
        {
          companyId: mixedCompany.id,
          userId: params.users.labelManager.id,
          role: CompanyRole.ADMIN,
          type: 'Agronomist',
        },
        {
          companyId: fruitCompany.id,
          userId: params.users.operator.id,
          role: CompanyRole.EDITOR,
          type: 'Field Operator',
        },
        {
          companyId: mixedCompany.id,
          userId: params.users.operator.id,
          role: CompanyRole.EDITOR,
          type: 'Field Operator',
        },
      ],
    });

    return { fruitCompany, mixedCompany };
  }

  private async seedWarehouses(params: { readonly companyId: string }): Promise<WarehouseContext> {
    const warehouses = await Promise.all([
      this.prisma.warehouse.create({
        data: {
          companyId: params.companyId,
          name: 'Deposito Nord',
          nation: 'Italia',
          region: 'Emilia-Romagna',
          city: 'Fontanellato',
          address: 'Via Roma 5',
          cap: '43012',
          sezione: 'FN',
          foglio: '12',
          particella: '115',
          subalterno: '1',
        },
      }),
      this.prisma.warehouse.create({
        data: {
          companyId: params.companyId,
          name: 'Deposito Sud',
          nation: 'Italia',
          region: 'Emilia-Romagna',
          city: 'Salsomaggiore Terme',
          address: 'Via Garibaldi 22',
          cap: '43039',
          sezione: 'SS',
          foglio: '8',
          particella: '75',
          subalterno: '2',
        },
      }),
    ]);
    return { warehouses };
  }

  private async seedMachines(params: { readonly companyId: string }): Promise<MachineContext> {
    const machines = await Promise.all([
      this.prisma.machine.create({
        data: {
          companyId: params.companyId,
          name: 'Atomizzatore trainato',
          identifier: 'MAC-ATOM-01',
          lastPositiveRevisionDate: new Date('2024-03-10T00:00:00.000Z'),
        },
      }),
      this.prisma.machine.create({
        data: {
          companyId: params.companyId,
          name: 'Seminatrice pneumatica',
          identifier: 'MAC-SEM-02',
          lastPositiveRevisionDate: new Date('2024-05-02T00:00:00.000Z'),
        },
      }),
    ]);
    return { machines };
  }

  private async seedFruitFields(params: { readonly companyId: string }): Promise<FieldContext> {
    const fields = await Promise.all([
      this.prisma.field.create({
        data: {
          companyId: params.companyId,
          name: 'Vigna Ancellotta',
          coordinates: [44.8389, 10.2966],
          latitude: 44.8389,
          longitude: 10.2966,
          polygon: {
            type: 'Polygon',
            coordinates: [
              [
                [10.2961, 44.8392],
                [10.2971, 44.8387],
                [10.2966, 44.8381],
                [10.2961, 44.8392],
              ],
            ],
          },
          gisHa: 5.2,
          sauHa: 4.9,
          ph: 6.8,
          nitrogen: 0.12,
          phosphorus: 35,
          potassium: 210,
          calcium: 85,
          magnesium: 15,
          soilType: 'Franco sabbioso',
          uso: 'Seminativo',
          qualita: 'AA',
          superficieCatastaleMq: 52000,
          sezione: 'VIG',
          foglio: '21',
          particella: '87',
          subalterno: '1',
          nation: 'Italia',
          region: 'Emilia-Romagna',
          city: 'Soragna',
          address: 'Strada Provinciale 1',
          cap: '43019',
          variazioneMq: '0',
          inizioConduzione: new Date('2022-03-01T00:00:00.000Z'),
        },
      }),
      this.prisma.field.create({
        data: {
          companyId: params.companyId,
          name: 'Mais Seletti',
          coordinates: [44.8254, 10.315],
          latitude: 44.8254,
          longitude: 10.315,
          polygon: {
            type: 'Polygon',
            coordinates: [
              [
                [10.314, 44.8258],
                [10.316, 44.8255],
                [10.315, 44.8247],
                [10.314, 44.8258],
              ],
            ],
          },
          gisHa: 7.4,
          sauHa: 7,
          ph: 6.5,
          nitrogen: 0.14,
          phosphorus: 28,
          potassium: 190,
          calcium: 60,
          magnesium: 14,
          soilType: 'Franco limoso',
          uso: 'Seminativo',
          qualita: 'AB',
          superficieCatastaleMq: 74000,
          sezione: 'MSL',
          foglio: '9',
          particella: '45',
          subalterno: '3',
          nation: 'Italia',
          region: 'Emilia-Romagna',
          city: 'Busseto',
          address: 'Via Argine 9',
          cap: '43011',
          variazioneMq: '150',
          inizioConduzione: new Date('2021-09-15T00:00:00.000Z'),
        },
      }),
    ]);
    return { fields };
  }

  private async seedMixedFields(params: { readonly companyId: string }): Promise<FieldContext> {
    const fields = await Promise.all([
      this.prisma.field.create({
        data: {
          companyId: params.companyId,
          name: 'Frumento Invernale',
          coordinates: [44.81, 10.32],
          latitude: 44.81,
          longitude: 10.32,
          polygon: {
            type: 'Polygon',
            coordinates: [
              [
                [10.319, 44.8105],
                [10.321, 44.8102],
                [10.3205, 44.8096],
                [10.319, 44.8105],
              ],
            ],
          },
          gisHa: 6.5,
          sauHa: 6.2,
          ph: 6.4,
          nitrogen: 0.13,
          phosphorus: 30,
          potassium: 200,
          calcium: 70,
          magnesium: 13,
          soilType: 'Franco argilloso',
          uso: 'Seminativo',
          qualita: 'AB',
          superficieCatastaleMq: 65000,
          sezione: 'FRI',
          foglio: '3',
          particella: '12',
          subalterno: '1',
          nation: 'Italia',
          region: 'Emilia-Romagna',
          city: 'Guastalla',
          address: 'Via Po 3',
          cap: '42016',
          variazioneMq: '0',
          inizioConduzione: new Date('2023-10-01T00:00:00.000Z'),
        },
      }),
      this.prisma.field.create({
        data: {
          companyId: params.companyId,
          name: 'Erba Medica Pianura',
          coordinates: [44.79, 10.3],
          latitude: 44.79,
          longitude: 10.3,
          polygon: {
            type: 'Polygon',
            coordinates: [
              [
                [10.299, 44.7905],
                [10.301, 44.7902],
                [10.3005, 44.7896],
                [10.299, 44.7905],
              ],
            ],
          },
          gisHa: 5.5,
          sauHa: 5.2,
          ph: 7.0,
          nitrogen: 0.18,
          phosphorus: 40,
          potassium: 230,
          calcium: 90,
          magnesium: 18,
          soilType: 'Franco',
          uso: 'Foraggere',
          qualita: 'AA',
          superficieCatastaleMq: 55000,
          sezione: 'MED',
          foglio: '4',
          particella: '21',
          subalterno: '2',
          nation: 'Italia',
          region: 'Emilia-Romagna',
          city: 'Novellara',
          address: 'Strada delle Foraggere 10',
          cap: '42017',
          variazioneMq: '0',
          inizioConduzione: new Date('2022-03-01T00:00:00.000Z'),
        },
      }),
    ]);
    return { fields };
  }

  private async seedFruitProductionUnits(): Promise<ProductionUnit[]> {
    const grapeUnit = await this.prisma.productionUnit.create({
      data: {
        name: 'Uva Lambrusco 2025',
        startDate: new Date('2025-03-10T00:00:00.000Z'),
        endDate: new Date('2025-10-10T00:00:00.000Z'),
        areaHa: 4.9,
      },
    });

    await this.prisma.productionCycle.create({
      data: {
        productionUnitId: grapeUnit.id,
        cropName: 'Vitis vinifera',
        cropType: 'Vigneto',
        variety: 'Lambrusco Ancellotta',
        protocoll: 'BIO-2025-LAMB',
        protectionStructure: 'Tendone',
        floweringDate: new Date('2025-05-20T00:00:00.000Z'),
        harvestingDate: new Date('2025-09-25T00:00:00.000Z'),
        occupazione: 'Coltura principale',
        destinazioneDiUso: 'Vinificazione',
        acquaTotalePeridoL: 120000,
        seasonYear: 2025,
        cycleIndex: 1,
      },
    });

    const maizeUnit = await this.prisma.productionUnit.create({
      data: {
        name: 'Mais Ceroso 2025',
        startDate: new Date('2025-04-05T00:00:00.000Z'),
        endDate: new Date('2025-11-05T00:00:00.000Z'),
        areaHa: 7,
      },
    });

    await this.prisma.productionCycle.create({
      data: {
        productionUnitId: maizeUnit.id,
        cropName: 'Zea mays',
        cropType: 'Seminativo',
        variety: 'Hybrid 603',
        protocoll: 'CON-2025-MAIS',
        protectionStructure: 'Campo aperto',
        floweringDate: new Date('2025-06-18T00:00:00.000Z'),
        harvestingDate: new Date('2025-10-02T00:00:00.000Z'),
        occupazione: 'Rotazione',
        destinazioneDiUso: 'Conferimento mangimificio',
        acquaTotalePeridoL: 175000,
        seasonYear: 2025,
        cycleIndex: 1,
      },
    });

    return [grapeUnit, maizeUnit];
  }

  private async seedMixedProductionUnits(): Promise<ProductionUnit[]> {
    const wheatUnit = await this.prisma.productionUnit.create({
      data: {
        name: 'Frumento tenero 2025',
        startDate: new Date('2024-10-15T00:00:00.000Z'),
        endDate: new Date('2025-07-15T00:00:00.000Z'),
        areaHa: 6.2,
      },
    });

    await this.prisma.productionCycle.create({
      data: {
        productionUnitId: wheatUnit.id,
        cropName: 'Triticum aestivum',
        cropType: 'Frumento tenero',
        variety: 'Bologna',
        protocoll: 'CON-2025-FRUM',
        protectionStructure: 'Campo aperto',
        floweringDate: new Date('2025-05-10T00:00:00.000Z'),
        harvestingDate: new Date('2025-07-01T00:00:00.000Z'),
        occupazione: 'Coltura principale',
        destinazioneDiUso: 'Granella',
        acquaTotalePeridoL: 80000,
        seasonYear: 2025,
        cycleIndex: 1,
      },
    });

    const alfalfaUnit = await this.prisma.productionUnit.create({
      data: {
        name: 'Erba medica 2025-2027',
        startDate: new Date('2025-03-01T00:00:00.000Z'),
        endDate: new Date('2027-11-30T00:00:00.000Z'),
        areaHa: 5.2,
      },
    });

    await this.prisma.productionCycle.createMany({
      data: [
        {
          productionUnitId: alfalfaUnit.id,
          cropName: 'Medicago sativa',
          cropType: 'Foraggere',
          variety: 'Erba medica',
          protocoll: 'CON-2025-MED-1',
          protectionStructure: 'Campo aperto',
          floweringDate: new Date('2025-05-15T00:00:00.000Z'),
          harvestingDate: new Date('2025-06-01T00:00:00.000Z'),
          occupazione: 'Primo taglio',
          destinazioneDiUso: 'Fieno',
          acquaTotalePeridoL: 30000,
          seasonYear: 2025,
          cycleIndex: 1,
        },
        {
          productionUnitId: alfalfaUnit.id,
          cropName: 'Medicago sativa',
          cropType: 'Foraggere',
          variety: 'Erba medica',
          protocoll: 'CON-2025-MED-2',
          protectionStructure: 'Campo aperto',
          floweringDate: new Date('2025-07-10T00:00:00.000Z'),
          harvestingDate: new Date('2025-07-25T00:00:00.000Z'),
          occupazione: 'Secondo taglio',
          destinazioneDiUso: 'Fieno',
          acquaTotalePeridoL: 28000,
          seasonYear: 2025,
          cycleIndex: 2,
        },
        {
          productionUnitId: alfalfaUnit.id,
          cropName: 'Medicago sativa',
          cropType: 'Foraggere',
          variety: 'Erba medica',
          protocoll: 'CON-2025-MED-3',
          protectionStructure: 'Campo aperto',
          floweringDate: new Date('2025-09-01T00:00:00.000Z'),
          harvestingDate: new Date('2025-09-15T00:00:00.000Z'),
          occupazione: 'Terzo taglio',
          destinazioneDiUso: 'Fieno',
          acquaTotalePeridoL: 26000,
          seasonYear: 2025,
          cycleIndex: 3,
        },
      ],
    });

    return [wheatUnit, alfalfaUnit];
  }

  private async linkProductionUnitsToFields(params: {
    readonly productionUnits: ProductionUnit[];
    readonly fields: Field[];
  }): Promise<void> {
    if (params.productionUnits.length < 2 || params.fields.length < 2) {
      return;
    }
    const links = [
      {
        productionUnitId: params.productionUnits[0].id,
        fieldId: params.fields[0].id,
        areaHaOnField: 4.9,
      },
      {
        productionUnitId: params.productionUnits[1].id,
        fieldId: params.fields[1].id,
        areaHaOnField: 7,
      },
    ];
    for (const link of links) {
      await this.prisma.productionUnitOnField.create({ data: link });
    }
  }

  private async linkMixedProductionUnitsToFields(params: {
    readonly productionUnits: ProductionUnit[];
    readonly fields: Field[];
  }): Promise<void> {
    if (params.productionUnits.length < 2 || params.fields.length < 2) {
      return;
    }
    const links = [
      {
        productionUnitId: params.productionUnits[0].id,
        fieldId: params.fields[0].id,
        areaHaOnField: 6.2,
      },
      {
        productionUnitId: params.productionUnits[1].id,
        fieldId: params.fields[1].id,
        areaHaOnField: 5.2,
      },
    ];
    for (const link of links) {
      await this.prisma.productionUnitOnField.create({ data: link });
    }
  }

  private async seedProducts(params: {
    readonly warehouses: Warehouse[];
  }): Promise<ProductContext> {
    const products: Product[] = [];
    for (let index = 0; index < PRODUCT_SOURCE_DATA.length; index += 1) {
      const source = PRODUCT_SOURCE_DATA[index];
      const warehouse = params.warehouses[index % params.warehouses.length];
      const product = await this.prisma.product.create({
        data: {
          warehouseId: warehouse.id,
          name: source.productName,
          sku: this.buildSku({
            registrationNumber: source.registrationNumber,
            productName: source.productName,
          }),
          barcode: `8050000000${index + 1}`,
          category: ProductCategory.PESTICIDE,
          type: source.productType,
          description: `${source.productType} registered as ${source.registrationNumber}.`,
          registrationNumber: source.registrationNumber,
          labelMetadata: {
            legalEntity: source.legalEntity,
            legalAddress: source.legalAddress,
            administrativeStatus: source.administrativeStatus,
            formulation: {
              code: source.formulationCode,
              description: source.formulationDescription,
            },
            activeSubstances: source.activeSubstances.split(',').map((item) => item.trim()),
          },
        },
      });
      products.push(product);
    }
    return { products };
  }

  private async seedJobs(params: {
    readonly productionUnits: ProductionUnit[];
    readonly machine: Machine;
    readonly operatorId: string;
  }): Promise<JobContext> {
    const jobs = await Promise.all([
      this.prisma.job.create({
        data: {
          productionUnitId: params.productionUnits[0].id,
          dateOfOpeation: new Date('2025-05-25T06:00:00.000Z'),
          isVerified: true,
          category: JobCategory.TREATMENT,
          quantity: 250,
          unitOfMeasureQuantity: 'L',
          productQuantityTreated: 4.5,
          unitOfMeasureProductQuantityTreated: 'ha',
          modeOfApplication: 'Atomizzatore trainato',
          avversity: 'Peronospora',
          giustification: 'Prevenzione precoce',
          treatedSurface: 4.5,
          isLocalizedTreatment: false,
          userId: params.operatorId,
          note: 'Condizioni meteo favorevoli',
          history: { steps: ['mixing', 'calibration', 'execution'] },
          totalDistributedWaterL: 1200,
          machineId: params.machine.id,
        },
      }),
      this.prisma.job.create({
        data: {
          productionUnitId: params.productionUnits[1].id,
          dateOfOpeation: new Date('2025-06-12T05:30:00.000Z'),
          isVerified: false,
          category: JobCategory.SEEDING,
          quantity: 180,
          unitOfMeasureQuantity: 'kg',
          productQuantityTreated: 7,
          unitOfMeasureProductQuantityTreated: 'ha',
          modeOfApplication: 'Seminatrice pneumatica',
          avversity: 'N/A',
          giustification: 'Riseminazione linee marginali',
          treatedSurface: 1.2,
          isLocalizedTreatment: true,
          userId: params.operatorId,
          note: 'Aggiunta microgranulatore',
          history: { steps: ['preparazione', 'taratura', 'residuo'] },
          totalDistributedWaterL: 0,
          machineId: params.machine.id,
        },
      }),
    ]);
    return { jobs };
  }

  private async seedStocks(params: {
    readonly products: Product[];
    readonly jobId: string;
    readonly companyId: string;
  }): Promise<void> {
    await Promise.all([
      this.prisma.stock.create({
        data: {
          productId: params.products[0].id,
          quantity: 180,
          unitOfMeasureQuantity: 'Kg',
          price: 950,
          unitOfMeasurePrice: 'EUR',
          type: 'IN',
          ddtCode: 'DDT-2025-001',
          companySupplierName: 'Agro Service Nord',
          addressSupplier: 'Via Emilia 42, Parma',
          vatNumberSupplier: 'IT09876543211',
          jobId: params.jobId,
        },
      }),
      this.prisma.stock.create({
        data: {
          productId: params.products[1].id,
          quantity: 25,
          unitOfMeasureQuantity: 'Kg',
          price: 420,
          unitOfMeasurePrice: 'EUR',
          type: 'OUT',
          invoiceCode: 'INV-2025-044',
          companySupplierName: 'Consorzio Agrario Emilia',
          addressSupplier: 'Via Mantova 10, Reggio Emilia',
          vatNumberSupplier: 'IT11223344556',
        },
      }),
    ]);
  }

  private async seedLabelExtractions(): Promise<void> {
    const hasSeededFromCsv = await this.seedLabelExtractionsFromCsv();
    if (hasSeededFromCsv) {
      return;
    }
    await this.seedLabelExtractionsFromProductSource();
  }

  private async seedLabelExtractionsFromCsv(): Promise<boolean> {
    try {
      const parser = createReadStream(LABEL_EXTRACTIONS_CSV_PATH).pipe(
        parse({
          bom: true,
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_quotes: true,
        }),
      );
      const batch: Prisma.LabelExtractionCreateManyInput[] = [];
      let totalSeeded = 0;
      for await (const record of parser) {
        const mappedRecord = this.mapLabelExtractionRow(record as LabelExtractionCsvRow);
        if (!mappedRecord) {
          continue;
        }
        batch.push(mappedRecord);
        if (batch.length >= LABEL_EXTRACTION_BATCH_SIZE) {
          await this.persistLabelExtractionsBatch(batch);
          totalSeeded += batch.length;
          batch.length = 0;
        }
      }
      if (batch.length > 0) {
        await this.persistLabelExtractionsBatch(batch);
        totalSeeded += batch.length;
      }
      if (this.labelParseErrors > 0) {
        console.warn(
          `[SEED] Label JSON parsing fallback applied ${this.labelParseErrors} time(s). Stored raw label in JSON field.`,
        );
      }
      if (totalSeeded === 0) {
        console.warn('[SEED] No label extractions imported from CSV, falling back to defaults.');
        return false;
      }
      console.log(`[SEED] Imported ${totalSeeded} label extractions from CSV.`);
      return true;
    } catch (error) {
      console.warn(
        '[SEED] Failed to import label extractions from CSV, falling back to defaults:',
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  private async persistLabelExtractionsBatch(
    batch: Prisma.LabelExtractionCreateManyInput[],
  ): Promise<void> {
    await this.prisma.labelExtraction.createMany({
      data: batch,
      skipDuplicates: true,
    });
  }

  private mapLabelExtractionRow(
    row: LabelExtractionCsvRow,
  ): Prisma.LabelExtractionCreateManyInput | null {
    try {
      const record: Prisma.LabelExtractionCreateManyInput = {
        productName: row.productName,
        registrationNumber: row.registrationNumber,
        sourceUrl: row.sourceUrl,
        category: this.parseLabelCategory(row.category),
        label: this.parseJsonValue(row.label),
        rawText: row.rawText,
        extractionConfidence: this.parseIntegerValue(row.extractionConfidence),
        isVerified: this.parseBooleanValue(row.isVerified),
        extractedFields: this.parseStringArray(row.extractedFields),
        errors: this.parseStringArray(row.errors),
        qualityExtraction: this.parseNumberArray(row.qualityExtraction),
      };
      const createdAt = this.parseDateValue(row.createdAt);
      const updatedAt = this.parseDateValue(row.updatedAt);
      if (row.id) {
        record.id = row.id;
      }
      if (createdAt) {
        record.createdAt = createdAt;
      }
      if (updatedAt) {
        record.updatedAt = updatedAt;
      }
      return record;
    } catch (error) {
      console.warn(
        `[SEED] Skipping label extraction row ${row.id || row.productName}:`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  private parseBooleanValue(rawValue: string): boolean {
    const normalized = (rawValue || '').trim().toLowerCase();
    return normalized === 'true' || normalized === 't' || normalized === '1';
  }

  private parseIntegerValue(rawValue: string): number {
    const parsed = Number.parseInt(rawValue || '0', 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private parseStringArray(rawValue: string): string[] {
    if (!rawValue) {
      return [];
    }
    if (rawValue.startsWith('{') && rawValue.endsWith('}')) {
      const content = rawValue.slice(1, -1);
      if (!content) {
        return [];
      }
      return content
        .split(',')
        .map((item) => item.replace(/^"+|"+$/g, '').trim())
        .filter((item) => item.length > 0);
    }
    try {
      const parsed = JSON.parse(rawValue) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch (error) {
      console.warn(
        '[SEED] Failed to parse string array:',
        error instanceof Error ? error.message : String(error),
      );
    }
    return [];
  }

  private parseNumberArray(rawValue: string): number[] {
    if (!rawValue) {
      return [];
    }
    if (rawValue.startsWith('{') && rawValue.endsWith('}')) {
      const content = rawValue.slice(1, -1);
      if (!content) {
        return [];
      }
      return content
        .split(',')
        .map((item) => Number.parseFloat(item))
        .filter((value) => Number.isFinite(value));
    }
    try {
      const parsed = JSON.parse(rawValue) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === 'number' ? item : Number.parseFloat(String(item))))
          .filter((value) => Number.isFinite(value));
      }
    } catch (error) {
      console.warn(
        '[SEED] Failed to parse number array:',
        error instanceof Error ? error.message : String(error),
      );
    }
    return [];
  }

  private parseLabelCategory(rawValue?: string): LabelCategory {
    const normalized = (rawValue || '').trim().toUpperCase();
    if (normalized === LabelCategory.FERTILIZER) {
      return LabelCategory.FERTILIZER;
    }
    return LabelCategory.FITO;
  }

  private parseJsonValue(rawValue: string): JsonValue {
    if (!rawValue) {
      return {};
    }
    try {
      return JSON.parse(rawValue) as JsonValue;
    } catch (error) {
      this.labelParseErrors += 1;
      if (this.labelParseErrors <= this.maxLabelParseWarnings) {
        console.warn(
          '[SEED] Failed to parse label JSON, storing raw label instead:',
          error instanceof Error ? error.message : String(error),
        );
      }
      return { rawLabel: rawValue };
    }
  }

  private parseDateValue(rawValue: string): Date | undefined {
    if (!rawValue) {
      return undefined;
    }
    const parsedDate = new Date(rawValue);
    if (Number.isNaN(parsedDate.getTime())) {
      return undefined;
    }
    return parsedDate;
  }

  private async seedLabelExtractionsFromProductSource(): Promise<void> {
    await Promise.all(
      PRODUCT_SOURCE_DATA.map((source, index) =>
        this.prisma.labelExtraction.create({
          data: {
            productName: source.productName,
            registrationNumber: source.registrationNumber,
            sourceUrl: `https://fitosanitari.demo/sources/${source.registrationNumber}`,
            label: {
              producer: source.legalEntity,
              formulation: source.formulationDescription,
              administrativeStatus: source.administrativeStatus,
            },
            rawText: `Estratto simulato per ${source.productName}`,
            extractionConfidence: 92 - index,
            isVerified: index === 0,
            extractedFields: ['registrationNumber', 'productName', 'hazardIndications'],
            errors: index === 0 ? [] : ['Pending validation'],
            qualityExtraction: [0.91, 0.89],
          },
        }),
      ),
    );
  }

  private buildSku(params: {
    readonly registrationNumber: string;
    readonly productName: string;
  }): string {
    const sanitizedName = params.productName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return `${sanitizedName}-${params.registrationNumber}`;
  }
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  ssl: resolvePrismaPgSsl(process.env.DATABASE_URL!),
});
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const seeder = new DatabaseSeeder(prisma);
  await seeder.execute();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
