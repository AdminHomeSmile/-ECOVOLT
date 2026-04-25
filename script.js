const goalForm = document.getElementById('goalForm');
const resultCards = document.getElementById('resultCards');
const dailySummary = document.getElementById('dailySummary');
const foodForm = document.getElementById('foodForm');
const foodTableBody = document.querySelector('#foodTable tbody');
const planTableBody = document.querySelector('#planTable tbody');
const statusMessage = document.getElementById('statusMessage');

const barcodeInput = document.getElementById('barcodeInput');
const lookupBarcodeButton = document.getElementById('lookupBarcode');

const cameraPreview = document.getElementById('cameraPreview');
const startCameraButton = document.getElementById('startCamera');
const scanNowButton = document.getElementById('scanNow');
const stopCameraButton = document.getElementById('stopCamera');

const state = {
  targets: null,
  foods: [],
  stream: null
};

const presetMenuIdeas = [
  'อกไก่ย่าง + ข้าวกล้อง + ผักลวก',
  'ไข่ต้ม + ขนมปังโฮลวีต + อะโวคาโด',
  'โยเกิร์ตกรีก + กล้วย + อัลมอนด์',
  'ปลาย่าง + มันหวาน + สลัด',
  'เต้าหู้ผัดเห็ด + ข้าวไรซ์เบอร์รี'
];

function showStatus(message, type = 'info') {
  statusMessage.className = `status ${type}`;
  statusMessage.textContent = message;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function calculateTargets(profile) {
  const { gender, age, weight, height, activityFactor, goal } = profile;

  const bmr = gender === 'male'
    ? (10 * weight) + (6.25 * height) - (5 * age) + 5
    : (10 * weight) + (6.25 * height) - (5 * age) - 161;

  const tdee = bmr * activityFactor;

  const goalModifiers = {
    lose: { calorieDelta: -400, proteinPerKg: 1.8, fatPercent: 0.25 },
    maintain: { calorieDelta: 0, proteinPerKg: 1.6, fatPercent: 0.3 },
    gain: { calorieDelta: 300, proteinPerKg: 2, fatPercent: 0.25 }
  };

  const selected = goalModifiers[goal];
  const calories = Math.max(1200, tdee + selected.calorieDelta);
  const protein = weight * selected.proteinPerKg;
  const fat = (calories * selected.fatPercent) / 9;
  const carbs = (calories - (protein * 4) - (fat * 9)) / 4;

  return {
    bmr: round(bmr),
    tdee: round(tdee),
    calories: round(calories),
    protein: round(protein),
    carbs: round(Math.max(carbs, 0)),
    fat: round(fat)
  };
}

function renderTargetCards(targets) {
  resultCards.innerHTML = '';
  const entries = [
    ['BMR', `${targets.bmr} kcal`],
    ['TDEE', `${targets.tdee} kcal`],
    ['พลังงานเป้าหมาย/วัน', `${targets.calories} kcal`],
    ['โปรตีน/วัน', `${targets.protein} g`],
    ['คาร์บ/วัน', `${targets.carbs} g`],
    ['ไขมัน/วัน', `${targets.fat} g`]
  ];

  entries.forEach(([label, value]) => {
    const card = document.createElement('article');
    card.className = 'stat-card';
    card.innerHTML = `<h4>${label}</h4><p>${value}</p>`;
    resultCards.appendChild(card);
  });
}

function renderFoodTable() {
  foodTableBody.innerHTML = '';
  state.foods.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.name}</td>
      <td>${item.servingText} × ${item.servings}</td>
      <td>${round(item.calories)}</td>
      <td>${round(item.protein)}</td>
      <td>${round(item.carbs)}</td>
      <td>${round(item.fat)}</td>
    `;
    foodTableBody.appendChild(row);
  });
}

function renderDailySummary() {
  dailySummary.innerHTML = '';

  const totals = state.foods.reduce((acc, food) => {
    acc.calories += food.calories;
    acc.protein += food.protein;
    acc.carbs += food.carbs;
    acc.fat += food.fat;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const target = state.targets || { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const summaryItems = [
    ['กินแล้ว kcal', totals.calories, target.calories],
    ['โปรตีน', totals.protein, target.protein],
    ['คาร์บ', totals.carbs, target.carbs],
    ['ไขมัน', totals.fat, target.fat]
  ];

  summaryItems.forEach(([label, consumed, goal]) => {
    const percent = goal > 0 ? Math.min((consumed / goal) * 100, 100) : 0;
    const card = document.createElement('article');
    card.className = 'stat-card';
    card.innerHTML = `
      <h4>${label}</h4>
      <p>${round(consumed)} / ${round(goal)}</p>
      <div class="meter"><span style="width:${round(percent)}%"></span></div>
    `;
    dailySummary.appendChild(card);
  });
}

function renderMealPlan(targets, mealsPerDay) {
  planTableBody.innerHTML = '';

  const mealCalories = round(targets.calories / mealsPerDay);
  const mealProtein = round(targets.protein / mealsPerDay);
  const mealCarbs = round(targets.carbs / mealsPerDay);
  const mealFat = round(targets.fat / mealsPerDay);

  for (let i = 1; i <= mealsPerDay; i += 1) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>มื้อ ${i}</td>
      <td>${mealCalories}</td>
      <td>${mealProtein}</td>
      <td>${mealCarbs}</td>
      <td>${mealFat}</td>
      <td>${presetMenuIdeas[(i - 1) % presetMenuIdeas.length]}</td>
    `;
    planTableBody.appendChild(row);
  }
}

async function lookupBarcode(barcode) {
  const code = barcode.trim();
  if (!code) {
    showStatus('กรุณาใส่บาร์โค้ดก่อนค้นหา', 'error');
    return;
  }

  showStatus('กำลังค้นหาข้อมูลสินค้า...', 'info');

  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    const data = await response.json();

    if (!data.product) {
      showStatus('ไม่พบข้อมูลสินค้าในฐานข้อมูล ลองกรอกข้อมูลโภชนาการเอง', 'error');
      return;
    }

    const product = data.product;
    const nutriments = product.nutriments || {};

    document.getElementById('foodName').value = product.product_name || `สินค้า ${code}`;
    document.getElementById('servingText').value = product.serving_size || '1 serving';

    const calories = nutriments['energy-kcal_serving'] ?? nutriments['energy-kcal_100g'] ?? 0;
    const protein = nutriments.proteins_serving ?? nutriments.proteins_100g ?? 0;
    const carbs = nutriments.carbohydrates_serving ?? nutriments.carbohydrates_100g ?? 0;
    const fat = nutriments.fat_serving ?? nutriments.fat_100g ?? 0;

    document.getElementById('foodCalories').value = round(Number(calories));
    document.getElementById('foodProtein').value = round(Number(protein));
    document.getElementById('foodCarbs').value = round(Number(carbs));
    document.getElementById('foodFat').value = round(Number(fat));

    showStatus('ดึงข้อมูลสำเร็จ ปรับแก้ตัวเลขได้ก่อนกดเพิ่มอาหาร', 'success');
  } catch (error) {
    showStatus('เชื่อมต่อฐานข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showStatus('อุปกรณ์นี้ไม่รองรับการเปิดกล้องผ่านเบราว์เซอร์', 'error');
    return;
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    cameraPreview.srcObject = state.stream;
    await cameraPreview.play();
    showStatus('เปิดกล้องแล้ว กด "สแกนตอนนี้" เพื่ออ่านบาร์โค้ด', 'success');
  } catch (error) {
    showStatus('ไม่สามารถเปิดกล้องได้ (กรุณาอนุญาตสิทธิ์กล้อง)', 'error');
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(track => track.stop());
    state.stream = null;
    cameraPreview.srcObject = null;
    showStatus('ปิดกล้องเรียบร้อย', 'info');
  }
}

async function scanBarcodeFromCamera() {
  if (!state.stream) {
    showStatus('กรุณาเปิดกล้องก่อนสแกน', 'error');
    return;
  }

  if (!('BarcodeDetector' in window)) {
    showStatus('เบราว์เซอร์นี้ยังไม่รองรับ BarcodeDetector กรุณากรอกบาร์โค้ดเอง', 'error');
    return;
  }

  try {
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const barcodes = await detector.detect(cameraPreview);

    if (!barcodes.length) {
      showStatus('ยังไม่พบบาร์โค้ด ลองขยับกล้องให้เห็นชัดขึ้น', 'error');
      return;
    }

    const value = barcodes[0].rawValue;
    barcodeInput.value = value;
    showStatus(`พบบาร์โค้ด: ${value} กำลังดึงข้อมูล...`, 'success');
    await lookupBarcode(value);
  } catch (error) {
    showStatus('สแกนไม่สำเร็จ กรุณาลองใหม่', 'error');
  }
}

goalForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const profile = {
    gender: document.getElementById('gender').value,
    age: Number(document.getElementById('age').value),
    weight: Number(document.getElementById('weight').value),
    height: Number(document.getElementById('height').value),
    activityFactor: Number(document.getElementById('activity').value),
    goal: document.getElementById('goal').value
  };

  const mealsPerDay = Number(document.getElementById('mealsPerDay').value);
  state.targets = calculateTargets(profile);
  renderTargetCards(state.targets);
  renderDailySummary();
  renderMealPlan(state.targets, mealsPerDay);
  showStatus('คำนวณเป้าหมายเรียบร้อยแล้ว เริ่มบันทึกอาหารได้เลย', 'success');
});

foodForm.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!state.targets) {
    showStatus('กรุณาคำนวณเป้าหมายรายวันก่อนเพิ่มอาหาร', 'error');
    return;
  }

  const servings = Number(document.getElementById('servings').value);
  const caloriesPerServing = Number(document.getElementById('foodCalories').value);
  const proteinPerServing = Number(document.getElementById('foodProtein').value);
  const carbsPerServing = Number(document.getElementById('foodCarbs').value);
  const fatPerServing = Number(document.getElementById('foodFat').value);

  state.foods.push({
    name: document.getElementById('foodName').value.trim(),
    servingText: document.getElementById('servingText').value.trim(),
    servings,
    calories: caloriesPerServing * servings,
    protein: proteinPerServing * servings,
    carbs: carbsPerServing * servings,
    fat: fatPerServing * servings
  });

  renderFoodTable();
  renderDailySummary();
  foodForm.reset();
  document.getElementById('servings').value = 1;
  showStatus('เพิ่มอาหารสำเร็จ', 'success');
});

lookupBarcodeButton.addEventListener('click', () => lookupBarcode(barcodeInput.value));
startCameraButton.addEventListener('click', startCamera);
stopCameraButton.addEventListener('click', stopCamera);
scanNowButton.addEventListener('click', scanBarcodeFromCamera);

window.addEventListener('beforeunload', stopCamera);
