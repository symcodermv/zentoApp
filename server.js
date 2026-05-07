require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT  = process.env.JWT_SECRET || 'zento-secret-2026';

const db = new Pool({
  host:     process.env.DB_HOST     || 'ap-southeast-2.pg.psdb.cloud',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_DATABASE || 'postgres',
  user:     process.env.DB_USERNAME || 'postgres.m2n45ghhdvik',
  password: process.env.DB_PASSWORD || 'pscale_pw_sBDoHKgcwDD9uZvVzI55JVgDKZgE8iCz',
  ssl: { rejectUnauthorized: false },
  max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000,
});

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://symcodermv.github.io',
    '*'
  ],
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true
}));
app.options('*', cors());
app.use(express.json({ limit: '25mb' }));

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(h.slice(7), JWT); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

const log = (uid, uname, mod, desc) =>
  db.query('INSERT INTO activity_logs (user_id,user_name,module,description) VALUES ($1,$2,$3,$4)',
    [uid, uname, mod, desc]).catch(() => {});

async function setup() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(150) UNIQUE, password VARCHAR(255), role VARCHAR(20) DEFAULT 'staff', avatar VARCHAR(5), active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS staff (id SERIAL PRIMARY KEY, name VARCHAR(100), role VARCHAR(80), phone VARCHAR(30), email VARCHAR(150), basic_salary NUMERIC(12,2) DEFAULT 0, join_date VARCHAR(20), address TEXT, status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS expense_categories (id SERIAL PRIMARY KEY, name VARCHAR(80), name_dv VARCHAR(120), color VARCHAR(20) DEFAULT '#ff4d6d', created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS sale_categories (id SERIAL PRIMARY KEY, name VARCHAR(80), name_dv VARCHAR(120), color VARCHAR(20) DEFAULT '#00e5bf', created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, date VARCHAR(20), amount NUMERIC(14,2), category_id INT, description TEXT, invoice_data TEXT, invoice_type VARCHAR(50), invoice_name VARCHAR(200), created_by INT, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS sales (id SERIAL PRIMARY KEY, date VARCHAR(20), amount NUMERIC(14,2), shop_name VARCHAR(100), category_id INT, payment_method VARCHAR(40) DEFAULT 'Cash', description TEXT, recorded_by INT, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS salaries (id SERIAL PRIMARY KEY, staff_id INT, month VARCHAR(8), basic_salary NUMERIC(12,2) DEFAULT 0, bonus NUMERIC(12,2) DEFAULT 0, deduction NUMERIC(12,2) DEFAULT 0, status VARCHAR(20) DEFAULT 'pending', notes TEXT, created_by INT, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS activity_logs (id SERIAL PRIMARY KEY, user_id INT, user_name VARCHAR(100), module VARCHAR(40), description TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS shop_products (id SERIAL PRIMARY KEY, name VARCHAR(200), name_dv VARCHAR(300), price NUMERIC(12,2), original_price NUMERIC(12,2), image TEXT, image_data TEXT, description TEXT, description_dv TEXT, category VARCHAR(60), featured BOOLEAN DEFAULT false, stock INT DEFAULT 0, active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS shop_slider (id SERIAL PRIMARY KEY, image TEXT, image_data TEXT, title VARCHAR(150), description TEXT, sort_order INT DEFAULT 0, active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS shop_orders (id SERIAL PRIMARY KEY, order_id VARCHAR(30) UNIQUE, customer_id INT, customer_data JSONB, items JSONB, subtotal NUMERIC(14,2), shipping NUMERIC(10,2), tax NUMERIC(10,2), total NUMERIC(14,2), status VARCHAR(30) DEFAULT 'pending', payment_status VARCHAR(30) DEFAULT 'pending_review', payment_method VARCHAR(40), created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS shop_contact_messages (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(150), message TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS shop_settings (key VARCHAR(60) PRIMARY KEY, value TEXT)`,
    `CREATE TABLE IF NOT EXISTS product_categories (id SERIAL PRIMARY KEY, name VARCHAR(80), name_dv VARCHAR(120), color VARCHAR(20) DEFAULT '#00e5bf', created_at TIMESTAMPTZ DEFAULT NOW())`,,
    `CREATE TABLE IF NOT EXISTS shop_customers (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(150) UNIQUE, phone VARCHAR(30), password VARCHAR(255), created_at TIMESTAMPTZ DEFAULT NOW())`,
  ];
  for (const sql of tables) { await db.query(sql).catch(e => console.log('Table:', e.message)); }

  const check = await db.query("SELECT 1 FROM users WHERE email='admin@zento.mv'").catch(() => ({ rows: [] }));
  if (!check.rows.length) {
    const [h1,h2,h3] = await Promise.all([bcrypt.hash('admin123',10),bcrypt.hash('manager123',10),bcrypt.hash('accounts123',10)]);
    await db.query(`INSERT INTO users (name,email,password,role,avatar) VALUES ('Admin','admin@zento.mv',$1,'admin','A'),('Manager','manager@zento.mv',$2,'manager','M'),('Accounts','accounts@zento.mv',$3,'accountant','C')`,[h1,h2,h3]).catch(()=>{});
  }
  const ec = await db.query('SELECT COUNT(*) FROM expense_categories').catch(() => ({ rows: [{ count: '1' }] }));
  if (parseInt(ec.rows[0].count) === 0) {
    await db.query(`INSERT INTO expense_categories (name,color) VALUES ('Rent','#ff4d6d'),('Utilities','#4db8ff'),('Supplies','#ffc15e'),('Transport','#f97316'),('Maintenance','#22d3a0'),('Other','#9494b0')`).catch(()=>{});
  }
  const sc = await db.query('SELECT COUNT(*) FROM sale_categories').catch(() => ({ rows: [{ count: '1' }] }));
  if (parseInt(sc.rows[0].count) === 0) {
    await db.query(`INSERT INTO sale_categories (name,color) VALUES ('Grocery','#00e5bf'),('Fruits','#22d3a0'),('Dairy','#ffc15e'),('Meat','#ff4d6d'),('Bakery','#f97316'),('Other','#9494b0')`).catch(()=>{});
  }
  await db.query(`INSERT INTO shop_settings (key,value) VALUES ('deliveryFee','150'),('freeThreshold','1500'),('minOrder','100'),('shopName','ZENTO'),('shopPhone','+960 7468757'),('shopEmail','info@zento.mv'),('shopAddress','Male, Maldives'),('shopHours','7:00 AM - 11:00 PM'),('bmlAccount','7712440335001'),('bmlSwift','BMLFMVMV'),('bmlName','ZENTO Store') ON CONFLICT (key) DO NOTHING`).catch(()=>{});
  const pp = await db.query('SELECT COUNT(*) FROM shop_products').catch(() => ({ rows: [{ count: '1' }] }));
  if (parseInt(pp.rows[0].count) === 0) {
    await db.query(`INSERT INTO shop_products (name,price,original_price,image,description,category,featured,stock) VALUES ('Fresh Red Apples 1kg',45.99,49.99,'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=400&h=300&fit=crop','Sweet crisp apples','fruits',true,50),('Organic Bananas',25.99,29.99,'https://images.unsplash.com/photo-1603833665858-e61d17a86224?w=400&h=300&fit=crop','Ripe organic bananas','fruits',true,100),('Fresh Milk 1L',35.99,39.99,'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&h=300&fit=crop','Pasteurized whole milk','dairy',true,75),('Farm Eggs 12pcs',28.99,32.99,'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400&h=300&fit=crop','Free-range eggs','dairy',true,200),('Fresh Tomatoes 500g',18.99,22.00,'https://images.unsplash.com/photo-1546470427-e26264be0b09?w=400&h=300&fit=crop','Ripe juicy tomatoes','vegetables',true,60),('Halal Chicken 1kg',89.99,99.99,'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=400&h=300&fit=crop','Fresh boneless chicken','meat',true,30)`).catch(()=>{});
  }
  const sl = await db.query('SELECT COUNT(*) FROM shop_slider').catch(() => ({ rows: [{ count: '1' }] }));
  if (parseInt(sl.rows[0].count) === 0) {
    await db.query(`INSERT INTO shop_slider (image,title,description,sort_order) VALUES ('https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&fit=crop','Fresh Produce Daily','Farm-fresh fruits and vegetables',1),('https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&fit=crop','Weekly Specials','Up to 30% off selected items',2)`).catch(()=>{});
  }
  // Add name_dv column if not exists (safe migration)
  await db.query("ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS name_dv VARCHAR(300)").catch(()=>{});
  await db.query("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_data TEXT").catch(()=>{});
  await db.query("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(50)").catch(()=>{});
  await db.query("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_name VARCHAR(200)").catch(()=>{});
  await db.query("ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS description_dv TEXT").catch(()=>{});
  await db.query("ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS name_dv VARCHAR(120)").catch(()=>{});
  await db.query("CREATE TABLE IF NOT EXISTS product_categories (id SERIAL PRIMARY KEY, name VARCHAR(80), name_dv VARCHAR(120), color VARCHAR(20) DEFAULT '#00e5bf', created_at TIMESTAMPTZ DEFAULT NOW())").catch(()=>{});
  await db.query("ALTER TABLE sale_categories ADD COLUMN IF NOT EXISTS name_dv VARCHAR(120)").catch(()=>{});
  console.log('Database ready');
}

app.options('*', cors());
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// AUTH
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const r = await db.query('SELECT * FROM users WHERE email=$1 AND active=true', [email]);
    if (!r.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const u = r.rows[0];
    if (!await bcrypt.compare(password, u.password)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: u.id, email: u.email, role: u.role, name: u.name }, JWT, { expiresIn: '7d' });
    await log(u.id, u.name, 'auth', 'Logged in');
    res.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role, avatar: u.name.charAt(0).toUpperCase() } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/auth/logout', auth, (req, res) => { log(req.user.id, req.user.name, 'auth', 'Logged out'); res.json({ success: true }); });
app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const r = await db.query('SELECT id,name,email,role FROM users WHERE id=$1', [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const u = r.rows[0];
    res.json({ ...u, avatar: u.name.charAt(0).toUpperCase() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DASHBOARD
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.slice(0, 7);
    const [ts,te,staffR,salR] = await Promise.all([
      db.query("SELECT COALESCE(SUM(amount),0) AS v FROM sales WHERE date=$1",[today]),
      db.query("SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE date=$1",[today]),
      db.query("SELECT COUNT(*) AS v FROM staff WHERE status='active'"),
      db.query("SELECT COUNT(*) AS v FROM salaries WHERE status='pending'"),
    ]);
    const last7 = [];
    for (let i=6;i>=0;i--) {
      const d=new Date(); d.setDate(d.getDate()-i);
      const dt=d.toISOString().split('T')[0];
      const label=d.toLocaleDateString('en-MV',{weekday:'short'});
      const [s,e]=await Promise.all([
        db.query("SELECT COALESCE(SUM(amount),0) AS v FROM sales WHERE date=$1",[dt]),
        db.query("SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE date=$1",[dt]),
      ]);
      last7.push({label,sales:parseFloat(s.rows[0].v),expenses:parseFloat(e.rows[0].v)});
    }
    const monthlyTrend=[];
    for (let i=5;i>=0;i--) {
      const d=new Date(); d.setMonth(d.getMonth()-i);
      const m=d.toISOString().slice(0,7);
      const label=d.toLocaleDateString('en-MV',{month:'short'});
      const [s,e]=await Promise.all([
        db.query("SELECT COALESCE(SUM(amount),0) AS v FROM sales WHERE date LIKE $1",[m+'%']),
        db.query("SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE date LIKE $1",[m+'%']),
      ]);
      monthlyTrend.push({label,sales:parseFloat(s.rows[0].v),expenses:parseFloat(e.rows[0].v)});
    }
    const expCat=await db.query(`SELECT ec.name,ec.color,COALESCE(SUM(e.amount),0) AS amount FROM expense_categories ec LEFT JOIN expenses e ON e.category_id=ec.id AND e.date LIKE $1 GROUP BY ec.id,ec.name,ec.color HAVING COALESCE(SUM(e.amount),0)>0 ORDER BY amount DESC LIMIT 6`,[thisMonth+'%']);
    const acts=await db.query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10');
    res.json({
      stats:{today_sales:parseFloat(ts.rows[0].v),today_expenses:parseFloat(te.rows[0].v),today_profit:parseFloat(ts.rows[0].v)-parseFloat(te.rows[0].v),total_staff:parseInt(staffR.rows[0].v),pending_salaries:parseInt(salR.rows[0].v)},
      charts:{last7,monthlyTrend,expByCategory:expCat.rows.map(r=>({...r,amount:parseFloat(r.amount)}))},
      recent_activity:acts.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SALES
app.get('/api/sales', auth, async (req, res) => {
  const { month=new Date().toISOString().slice(0,7) } = req.query;
  try {
    const r=await db.query(`SELECT s.*,sc.name AS category,sc.color AS category_color,u.name AS recorded_by_name FROM sales s LEFT JOIN sale_categories sc ON sc.id=s.category_id LEFT JOIN users u ON u.id=s.recorded_by WHERE s.date LIKE $1 ORDER BY s.date DESC,s.created_at DESC`,[month+'%']);
    res.json({sales:r.rows,count:r.rows.length,total:r.rows.reduce((a,b)=>a+parseFloat(b.amount),0)});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/sales', auth, async (req, res) => {
  const {date,amount,shop_name,category_id,payment_method,description}=req.body;
  if(!date||!amount||!category_id) return res.status(400).json({error:'Required fields missing'});
  try {
    const r=await db.query('INSERT INTO sales (date,amount,shop_name,category_id,payment_method,description,recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',[date,amount,shop_name,category_id,payment_method||'Cash',description,req.user.id]);
    await log(req.user.id,req.user.name,'sales',`Added sale MVR ${amount}`);
    res.json({success:true,id:r.rows[0].id});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/sales/:id', auth, async (req, res) => {
  const {date,amount,shop_name,category_id,payment_method,description}=req.body;
  try { await db.query('UPDATE sales SET date=$1,amount=$2,shop_name=$3,category_id=$4,payment_method=$5,description=$6 WHERE id=$7',[date,amount,shop_name,category_id,payment_method,description,req.params.id]); res.json({success:true}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/sales/:id', auth, async (req, res) => {
  try { await db.query('DELETE FROM sales WHERE id=$1',[req.params.id]); res.json({success:true}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// EXPENSES
app.get('/api/expenses', auth, async (req, res) => {
  const { month=new Date().toISOString().slice(0,7) } = req.query;
  try {
    const r=await db.query(`SELECT e.id,e.date,e.amount,e.category_id,e.description,e.invoice_type,e.invoice_name,CASE WHEN e.invoice_data IS NOT NULL THEN true ELSE false END AS has_invoice,ec.name AS category,ec.color AS category_color,u.name AS created_by_name FROM expenses e LEFT JOIN expense_categories ec ON ec.id=e.category_id LEFT JOIN users u ON u.id=e.created_by WHERE e.date LIKE $1 ORDER BY e.date DESC,e.created_at DESC`,[month+'%']);
    res.json({expenses:r.rows,count:r.rows.length,total:r.rows.reduce((a,b)=>a+parseFloat(b.amount),0)});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/expenses/:id', auth, async (req, res) => {
  try {
    const r=await db.query(`SELECT e.*,ec.name AS category,ec.color AS category_color,u.name AS created_by_name FROM expenses e LEFT JOIN expense_categories ec ON ec.id=e.category_id LEFT JOIN users u ON u.id=e.created_by WHERE e.id=$1`,[req.params.id]);
    if(!r.rows.length) return res.status(404).json({error:'Not found'});
    res.json({...r.rows[0],has_invoice:!!r.rows[0].invoice_data});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/expenses', auth, async (req, res) => {
  const {date,amount,category_id,description,invoice_data,invoice_type,invoice_name}=req.body;
  if(!date||!amount||!category_id) return res.status(400).json({error:'Required fields missing'});
  try {
    const r=await db.query('INSERT INTO expenses (date,amount,category_id,description,invoice_data,invoice_type,invoice_name,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[date,amount,category_id,description,invoice_data||null,invoice_type||null,invoice_name||null,req.user.id]);
    await log(req.user.id,req.user.name,'expenses',`Added expense MVR ${amount}`);
    res.json({success:true,id:r.rows[0].id});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/expenses/:id', auth, async (req, res) => {
  const {date,amount,category_id,description,invoice_data,invoice_type,invoice_name}=req.body;
  try {
    await db.query('UPDATE expenses SET date=$1,amount=$2,category_id=$3,description=$4 WHERE id=$5',[date,amount,category_id,description,req.params.id]);
    if(invoice_data) await db.query('UPDATE expenses SET invoice_data=$1,invoice_type=$2,invoice_name=$3 WHERE id=$4',[invoice_data,invoice_type,invoice_name,req.params.id]);
    res.json({success:true});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/expenses/:id', auth, async (req, res) => {
  try { await db.query('DELETE FROM expenses WHERE id=$1',[req.params.id]); res.json({success:true}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// STAFF
app.get('/api/staff', auth, async (req, res) => {
  const {status}=req.query;
  try {
    let q='SELECT * FROM staff'; const p=[];
    if(status){q+=' WHERE status=$1';p.push(status);}
    q+=' ORDER BY name';
    const r=await db.query(q,p);
    res.json({staff:r.rows.map(s=>({...s,avatar:s.name.charAt(0).toUpperCase()})),count:r.rows.length});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/staff', auth, async (req, res) => {
  const {name,role,phone,email,basic_salary,join_date,address,status}=req.body;
  try {
    const r=await db.query('INSERT INTO staff (name,role,phone,email,basic_salary,join_date,address,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[name,role,phone,email,basic_salary||0,join_date||'',address,status||'active']);
    await log(req.user.id,req.user.name,'staff',`Added staff: ${name}`);
    res.json({success:true,id:r.rows[0].id});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/staff/:id', auth, async (req, res) => {
  const {name,role,phone,email,basic_salary,join_date,address,status}=req.body;
  try { await db.query('UPDATE staff SET name=$1,role=$2,phone=$3,email=$4,basic_salary=$5,join_date=$6,address=$7,status=$8 WHERE id=$9',[name,role,phone,email,basic_salary,join_date||'',address,status,req.params.id]); res.json({success:true}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/staff/:id', auth, async (req, res) => {
  try { await db.query('DELETE FROM staff WHERE id=$1',[req.params.id]); res.json({success:true}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// SALARY
app.get('/api/salary', auth, async (req, res) => {
  const {month,status}=req.query;
  try {
    let q=`SELECT sl.*,st.name AS staff_name,st.role AS staff_role,(sl.basic_salary+sl.bonus-sl.deduction) AS net_salary FROM salaries sl LEFT JOIN staff st ON st.id=sl.staff_id WHERE 1=1`;
    const p=[];
    if(month){q+=` AND sl.month=$${p.length+1}`;p.push(month);}
    if(status){q+=` AND sl.status=$${p.length+1}`;p.push(status);}
    q+=' ORDER BY sl.created_at DESC';
    const r=await db.query(q,p);
    const paid=r.rows.filter(x=>x.status==='paid').reduce((a,b)=>a+parseFloat(b.net_salary||0),0);
    const pending=r.rows.filter(x=>x.status==='pending').reduce((a,b)=>a+parseFloat(b.net_salary||0),0);
    res.json({salaries:r.rows,count:r.rows.length,total_paid:paid,total_pending:pending});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/salary', auth, async (req, res) => {
  const {staff_id,month,basic_salary,bonus,deduction,status,notes}=req.body;
  try {
    const r=await db.query('INSERT INTO salaries (staff_id,month,basic_salary,bonus,deduction,status,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[staff_id,month,basic_salary||0,bonus||0,deduction||0,status||'pending',notes,req.user.id]);
    res.json({success:true,id:r.rows[0].id});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/salary/:id', auth, async (req, res) => {
  const {status,basic_salary,bonus,deduction,notes}=req.body;
  try {
    const sets=[],vals=[];
    if(status!==undefined){sets.push(`status=$${vals.length+1}`);vals.push(status);}
    if(basic_salary!==undefined){sets.push(`basic_salary=$${vals.length+1}`);vals.push(basic_salary);}
    if(bonus!==undefined){sets.push(`bonus=$${vals.length+1}`);vals.push(bonus);}
    if(deduction!==undefined){sets.push(`deduction=$${vals.length+1}`);vals.push(deduction);}
    if(notes!==undefined){sets.push(`notes=$${vals.length+1}`);vals.push(notes);}
    if(!sets.length) return res.json({success:true});
    vals.push(req.params.id);
    await db.query(`UPDATE salaries SET ${sets.join(',')} WHERE id=$${vals.length}`,vals);
    res.json({success:true});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/salary/:id', auth, async (req, res) => {
  try { await db.query('DELETE FROM salaries WHERE id=$1',[req.params.id]); res.json({success:true}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// CATEGORIES
app.get('/api/categories/expenses', auth, async (req, res) => { const r=await db.query('SELECT * FROM expense_categories ORDER BY name').catch(()=>({rows:[]})); res.json(r.rows); });
app.post('/api/categories/expenses', auth, async (req, res) => { try { await db.query('INSERT INTO expense_categories (name,name_dv,color) VALUES ($1,$2,$3)',[req.body.name,req.body.name_dv||null,req.body.color||'#ff4d6d']); res.json({success:true}); } catch(e){res.status(500).json({error:e.message});} });
app.put('/api/categories/expenses/:id', auth, async (req, res) => { await db.query('UPDATE expense_categories SET name=$1,name_dv=$2,color=$3 WHERE id=$4',[req.body.name,req.body.name_dv||null,req.body.color,req.params.id]); res.json({success:true}); });
app.delete('/api/categories/expenses/:id', auth, async (req, res) => { await db.query('DELETE FROM expense_categories WHERE id=$1',[req.params.id]); res.json({success:true}); });

app.get('/api/categories/sales', auth, async (req, res) => { const r=await db.query('SELECT * FROM sale_categories ORDER BY name').catch(()=>({rows:[]})); res.json(r.rows); });
app.post('/api/categories/sales', auth, async (req, res) => { try { await db.query('INSERT INTO sale_categories (name,name_dv,color) VALUES ($1,$2,$3)',[req.body.name,req.body.name_dv||null,req.body.color||'#00e5bf']); res.json({success:true}); } catch(e){res.status(500).json({error:e.message});} });
app.put('/api/categories/sales/:id', auth, async (req, res) => { await db.query('UPDATE sale_categories SET name=$1,name_dv=$2,color=$3 WHERE id=$4',[req.body.name,req.body.name_dv||null,req.body.color,req.params.id]); res.json({success:true}); });
app.delete('/api/categories/sales/:id', auth, async (req, res) => { await db.query('DELETE FROM sale_categories WHERE id=$1',[req.params.id]); res.json({success:true}); });

// PRODUCT CATEGORIES
app.get('/api/categories/products/public', async (req, res) => {
  const r = await db.query('SELECT * FROM product_categories ORDER BY name').catch(()=>({rows:[]}));
  res.json(r.rows);
});
app.get('/api/categories/products', auth, async (req, res) => {
  const r = await db.query('SELECT * FROM product_categories ORDER BY name').catch(()=>({rows:[]}));
  res.json(r.rows);
});
app.post('/api/categories/products', auth, async (req, res) => {
  try {
    await db.query('INSERT INTO product_categories (name,name_dv,color) VALUES ($1,$2,$3)',
      [req.body.name, req.body.name_dv||null, req.body.color||'#00e5bf']);
    res.json({success:true});
  } catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/categories/products/:id', auth, async (req, res) => {
  try {
    await db.query('UPDATE product_categories SET name=$1,name_dv=$2,color=$3 WHERE id=$4',
      [req.body.name, req.body.name_dv||null, req.body.color, req.params.id]);
    res.json({success:true});
  } catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/categories/products/:id', auth, async (req, res) => {
  try { await db.query('DELETE FROM product_categories WHERE id=$1',[req.params.id]); res.json({success:true}); }
  catch(e){res.status(500).json({error:e.message});}
});

// USERS
app.get('/api/users', auth, async (req, res) => { const r=await db.query('SELECT id,name,email,role,active FROM users ORDER BY name').catch(()=>({rows:[]})); res.json(r.rows.map(u=>({...u,avatar:u.name.charAt(0).toUpperCase()}))); });
app.post('/api/users', auth, async (req, res) => {
  try { const hash=await bcrypt.hash(req.body.password,10); await db.query('INSERT INTO users (name,email,password,role,avatar) VALUES ($1,$2,$3,$4,$5)',[req.body.name,req.body.email,hash,req.body.role||'staff',req.body.name.charAt(0).toUpperCase()]); res.json({success:true}); }
  catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/users/:id', auth, async (req, res) => { try { await db.query('UPDATE users SET active=$1 WHERE id=$2',[req.body.active,req.params.id]); res.json({success:true}); } catch(e){res.status(500).json({error:e.message});} });

// REPORTS
app.get('/api/reports/summary', auth, async (req, res) => {
  const {month=new Date().toISOString().slice(0,7)}=req.query;
  try {
    const pat=month+'%';
    const [sales,exp,pay]=await Promise.all([
      db.query("SELECT COALESCE(SUM(amount),0) AS v FROM sales WHERE date LIKE $1",[pat]),
      db.query("SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE date LIKE $1",[pat]),
      db.query("SELECT COALESCE(SUM(basic_salary+bonus-deduction),0) AS v FROM salaries WHERE month=$1",[month]),
    ]);
    const sCat=await db.query(`SELECT sc.name,sc.color,COALESCE(SUM(s.amount),0) AS amount FROM sale_categories sc LEFT JOIN sales s ON s.category_id=sc.id AND s.date LIKE $1 GROUP BY sc.id,sc.name,sc.color HAVING COALESCE(SUM(s.amount),0)>0 ORDER BY amount DESC`,[pat]);
    const eCat=await db.query(`SELECT ec.name,ec.color,COALESCE(SUM(e.amount),0) AS amount FROM expense_categories ec LEFT JOIN expenses e ON e.category_id=ec.id AND e.date LIKE $1 GROUP BY ec.id,ec.name,ec.color HAVING COALESCE(SUM(e.amount),0)>0 ORDER BY amount DESC`,[pat]);
    const method=await db.query(`SELECT payment_method AS method,SUM(amount) AS amount FROM sales WHERE date LIKE $1 GROUP BY payment_method`,[pat]);
    const ts=parseFloat(sales.rows[0].v),te=parseFloat(exp.rows[0].v),tp=parseFloat(pay.rows[0].v);
    res.json({totalSales:ts,totalExpenses:te,totalPayroll:tp,netProfit:ts-te-tp,salesByCategory:sCat.rows.map(r=>({...r,amount:parseFloat(r.amount)})),expByCategory:eCat.rows.map(r=>({...r,amount:parseFloat(r.amount)})),salesByMethod:method.rows.map(r=>({...r,amount:parseFloat(r.amount)}))});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SHOP PRODUCTS
app.get('/api/shop/products', async (req, res) => {
  try {
    const [prods,slider,settings]=await Promise.all([
      db.query('SELECT id,name,name_dv,price,original_price,image,image_data,description,description_dv,category,featured,stock,active FROM shop_products WHERE active=true ORDER BY featured DESC,id DESC'),
      db.query('SELECT id,image,image_data,title,description,sort_order FROM shop_slider WHERE active=true ORDER BY sort_order'),
      db.query('SELECT key,value FROM shop_settings'),
    ]);
    const sm={};settings.rows.forEach(r=>{sm[r.key]=isNaN(r.value)?r.value:parseFloat(r.value);});
    const mapImg=p=>({...p,image:p.image_data||p.image,image_data:undefined});
    res.json({products:prods.rows.map(mapImg),slider:slider.rows.map(mapImg),settings:sm});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/shop/products/all', auth, async (req, res) => {
  try { const r=await db.query('SELECT id,name,name_dv,price,original_price,image,image_data,description,description_dv,category,featured,stock,active FROM shop_products ORDER BY id DESC'); res.json({products:r.rows.map(p=>({...p,image:p.image_data||p.image,image_data:undefined}))}); }
  catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/shop/products', auth, async (req, res) => {
  const {name,price,original_price,image,image_data,description,category,featured,stock}=req.body;
  try { const {name_dv,description_dv}=req.body; const r=await db.query('INSERT INTO shop_products (name,name_dv,price,original_price,image,image_data,description,description_dv,category,featured,stock) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[name,name_dv||null,price,original_price||null,image||null,image_data||null,description,description_dv||null,category,featured||false,stock||0]); res.json({success:true,id:r.rows[0].id}); }
  catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/shop/products/:id', auth, async (req, res) => {
  const {name,price,original_price,image,image_data,description,category,featured,stock,active}=req.body;
  try { const {name_dv:nd,description_dv:dd}=req.body; await db.query('UPDATE shop_products SET name=$1,name_dv=$2,price=$3,original_price=$4,image=$5,image_data=$6,description=$7,description_dv=$8,category=$9,featured=$10,stock=$11,active=$12 WHERE id=$13',[name,nd||null,price,original_price||null,image||null,image_data||null,description,dd||null,category,featured,stock,active!==false,req.params.id]); res.json({success:true}); }
  catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/shop/products/:id', auth, async (req, res) => { try{await db.query('DELETE FROM shop_products WHERE id=$1',[req.params.id]);res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

// SHOP SLIDER
app.get('/api/shop/slider', auth, async (req, res) => { const r=await db.query('SELECT * FROM shop_slider ORDER BY sort_order').catch(()=>({rows:[]})); res.json({slider:r.rows.map(s=>({...s,image:s.image_data||s.image,image_data:undefined}))}); });
app.post('/api/shop/slider', auth, async (req, res) => {
  const {image,image_data,title,description,sort_order}=req.body;
  try { const r=await db.query('INSERT INTO shop_slider (image,image_data,title,description,sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING id',[image||null,image_data||null,title,description,sort_order||0]); res.json({success:true,id:r.rows[0].id}); }
  catch(e){res.status(500).json({error:e.message});}
});
app.put('/api/shop/slider/:id', auth, async (req, res) => {
  const {image,image_data,title,description,sort_order,active}=req.body;
  try { await db.query('UPDATE shop_slider SET image=$1,image_data=$2,title=$3,description=$4,sort_order=$5,active=$6 WHERE id=$7',[image||null,image_data||null,title,description,sort_order,active!==false,req.params.id]); res.json({success:true}); }
  catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/shop/slider/:id', auth, async (req, res) => { try{await db.query('DELETE FROM shop_slider WHERE id=$1',[req.params.id]);res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

// SHOP SETTINGS
app.get('/api/shop/settings', auth, async (req, res) => { const r=await db.query('SELECT * FROM shop_settings').catch(()=>({rows:[]})); const m={};r.rows.forEach(x=>{m[x.key]=x.value;});res.json(m); });
app.put('/api/shop/settings', auth, async (req, res) => {
  try { for(const [k,v] of Object.entries(req.body)){await db.query('INSERT INTO shop_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',[k,String(v)]);} res.json({success:true}); }
  catch(e){res.status(500).json({error:e.message});}
});

// SHOP AUTH
app.post('/api/shop/auth/register', async (req, res) => {
  const {name,email,phone,password}=req.body;
  try {
    const ex=await db.query('SELECT 1 FROM shop_customers WHERE email=$1',[email]);
    if(ex.rows.length) return res.status(409).json({error:'Email already registered'});
    const hash=await bcrypt.hash(password,10);
    const r=await db.query('INSERT INTO shop_customers (name,email,phone,password) VALUES ($1,$2,$3,$4) RETURNING id,name,email,phone',[name,email,phone,hash]);
    const u=r.rows[0];
    const token=jwt.sign({id:u.id,email:u.email,type:'customer'},JWT,{expiresIn:'30d'});
    res.json({user:{...u,fullName:u.name},token});
  } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/shop/auth/login', async (req, res) => {
  const {email,password}=req.body;
  try {
    const r=await db.query('SELECT * FROM shop_customers WHERE email=$1',[email]);
    if(!r.rows.length) return res.status(401).json({error:'Invalid credentials'});
    const u=r.rows[0];
    if(!await bcrypt.compare(password,u.password)) return res.status(401).json({error:'Invalid credentials'});
    const token=jwt.sign({id:u.id,email:u.email,type:'customer'},JWT,{expiresIn:'30d'});
    res.json({user:{id:u.id,fullName:u.name,name:u.name,email:u.email,phone:u.phone},token});
  } catch(e){res.status(500).json({error:e.message});}
});

// SHOP ORDERS
app.post('/api/shop/orders', async (req, res) => {
  const {orderId,customer,items,subtotal,shipping,tax,total,status,paymentStatus,paymentMethod,userId}=req.body;
  try { await db.query('INSERT INTO shop_orders (order_id,customer_id,customer_data,items,subtotal,shipping,tax,total,status,payment_status,payment_method) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[orderId,userId||null,JSON.stringify(customer||{}),JSON.stringify(items),subtotal,shipping,tax,total,status||'pending',paymentStatus||'pending_review',paymentMethod||'bank_transfer']); res.json({success:true,orderId}); }
  catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/shop/orders/all', auth, async (req, res) => {
  try { const r=await db.query('SELECT * FROM shop_orders ORDER BY created_at DESC LIMIT 500'); res.json({orders:r.rows}); }
  catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/shop/orders', async (req, res) => {
  const {userId}=req.query;
  try {
    let q='SELECT * FROM shop_orders'; const p=[];
    if(userId){q+=' WHERE customer_id=$1';p.push(userId);}
    q+=' ORDER BY created_at DESC';
    const r=await db.query(q,p);
    const orders=r.rows.map(o=>({id:o.id,orderId:o.order_id,customer:typeof o.customer_data==='string'?JSON.parse(o.customer_data):o.customer_data,items:typeof o.items==='string'?JSON.parse(o.items):o.items,subtotal:parseFloat(o.subtotal),shipping:parseFloat(o.shipping),tax:parseFloat(o.tax),total:parseFloat(o.total),status:o.status,paymentStatus:o.payment_status,createdAt:o.created_at}));
    res.json({orders});
  } catch(e){res.status(500).json({error:e.message});}
});

app.put('/api/shop/orders/:id', auth, async (req, res) => {
  const {status,payment_status}=req.body;
  try { await db.query('UPDATE shop_orders SET status=$1,payment_status=$2 WHERE order_id=$3',[status,payment_status,req.params.id]); res.json({success:true}); }
  catch(e){res.status(500).json({error:e.message});}
});

// CONTACT
app.post('/api/shop/contact', async (req, res) => {
  try { await db.query('INSERT INTO shop_contact_messages (name,email,message) VALUES ($1,$2,$3)',[req.body.name,req.body.email,req.body.message]); res.json({success:true}); }
  catch(e){res.status(500).json({error:e.message});}
});

app.use((req,res)=>res.status(404).json({error:'Not found'}));

(async()=>{
  await setup();
  app.listen(PORT,()=>{
    console.log('\n ZENTO Backend Running');
    console.log(' Port: '+PORT);
    console.log(' admin@zento.mv / admin123\n');
  });
})();
