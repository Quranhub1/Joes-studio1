import fs from 'node:fs';
import path from 'node:path';

const W = 323.3, H = 204.1;
const colors = ['#0f3d68','#991b1b','#065f46','#6d28d9','#c2410c','#1d4ed8','#be123c','#0f766e','#4338ca','#7c2d12','#0369a1','#047857','#7e22ce','#b45309','#9f1239','#334155','#166534','#3730a3','#9a3412','#155e75'];

const rect = (left, top, width, height, fill = 'transparent', stroke, strokeWidth = 0, radius = 0) => ({ type:'rect', left, top, width, height, fill, ...(stroke ? {stroke} : {}), strokeWidth, originX:'left', originY:'top', ...(radius ? {rx:radius, ry:radius} : {}) });
const circle = (left, top, radius, fill, stroke, strokeWidth = 0) => ({ type:'circle', left, top, radius, fill, ...(stroke ? {stroke} : {}), strokeWidth, originX:'center', originY:'center' });
const text = (value, left, top, fontSize, fill = '#111827', fontWeight = 'normal', binding) => ({ type:'i-text', text:value, rawContent:value, left, top, fontSize, fontFamily:'Arial', fontWeight, fill, originX:'left', originY:'top', ...(binding ? {dataBinding:{type:'variable',sheet:'Sheet1',field:binding},editable:false} : {}) });
const rightText = (value, left, top, fontSize, fill, fontWeight='normal') => ({ type:'i-text', text:value, rawContent:value, left, top, fontSize, fontFamily:'Arial', fontWeight, fill, originX:'right', originY:'top', textAlign:'right' });

function makeCard(i) {
  const c = colors[i - 1];
  const pale = '#f1f5f9';
  let objects = [rect(0,0,W,H,'#ffffff',c,3)];
  const style = i % 4;
  if (style === 1) {
    objects.push(rect(0,0,W,48,c), circle(42,100,30,pale,c,2), rightText('PHOTO',42,95,10,c,'bold'), text(`STUDENT CARD ${String(i).padStart(2,'0')}`,12,13,16,'#ffffff','bold'), rightText('YOUR SCHOOL / INSTITUTION',311,16,8,'#ffffff','bold'), text('{{Student Name}}',82,58,17,'#111827','bold','Student Name'), text('{{Registration Number}}',82,88,13,'#111827','bold','Registration Number'), text('{{Course}}',82,116,12,'#111827','normal','Course'), text('Year: {{Year}}',82,143,11,'#111827','normal','Year'), text('ID: {{Student ID}}',12,181,8,c,'bold','Student ID'));
  } else if (style === 2) {
    objects.push(rect(0,0,72,H,c), circle(36,60,25,'#ffffff'), rightText('PHOTO',36,55,8,c,'bold'), text(`STUDENT ${String(i).padStart(2,'0')}`,88,14,15,c,'bold'), text('ACADEMIC IDENTITY CARD',88,35,8,'#64748b'), text('{{Student Name}}',88,64,16,'#111827','bold','Student Name'), text('REG: {{Registration Number}}',88,94,11,c,'bold','Registration Number'), text('{{Course}}',88,121,11,'#111827','normal','Course'), text('YEAR {{Year}}',88,147,10,'#111827','normal','Year'), text('STUDENT ID: {{Student ID}}',88,178,8,'#64748b','bold','Student ID'));
  } else if (style === 3) {
    objects.push(rect(0,0,W,12,c), rect(12,28,299,158,'#ffffff',c,1,10), circle(270,65,25,pale,c,2), rightText('PHOTO',270,60,8,c,'bold'), text(`STUDENT CARD ${String(i).padStart(2,'0')}`,24,40,15,c,'bold'), text('{{Student Name}}',24,78,17,'#111827','bold','Student Name'), text('Registration',24,108,8,'#64748b','bold'), text('{{Registration Number}}',24,120,11,'#111827','normal','Registration Number'), text('{{Course}}  •  Year {{Year}}',24,147,10,'#111827','normal','Course'), text('ID {{Student ID}}',24,174,8,c,'bold','Student ID'));
  } else {
    objects.push(rect(0,0,W,38,'#ffffff',c,0), rect(0,38,W,4,c), circle(48,90,27,pale,c,2), rightText('PHOTO',48,85,8,c,'bold'), text(`STUDENT CARD ${String(i).padStart(2,'0')}`,90,12,14,c,'bold'), text('{{Student Name}}',90,55,16,'#111827','bold','Student Name'), text('{{Registration Number}}',90,84,11,c,'bold','Registration Number'), rect(90,112,215,1,'#e2e8f0'), text('COURSE',90,121,7,'#64748b','bold'), text('{{Course}}',90,133,10,'#111827','normal','Course'), text('YEAR {{Year}}',90,157,9,'#111827','normal','Year'), text('ID {{Student ID}}',12,183,8,c,'bold','Student ID'));
  }
  return { version:'4.2', settings:{type:'label',labelWidth:85.6,labelHeight:54,labelCols:2,labelRows:4,labelGapH:2,labelGapV:2,marginTop:10,marginBottom:10,marginLeft:16,marginRight:16,labelQuantity:1,paperBgColor:'#ffffff',fitLabelSize:false,showCropMarks:false}, paperSize:'A4', canvasData:{version:'5.3.0',objects,background:'#ffffff'} };
}

const dir = path.resolve('templates');
fs.mkdirSync(dir,{recursive:true});
for (let i=1;i<=20;i++) fs.writeFileSync(path.join(dir,`student_card_${String(i).padStart(2,'0')}.json`), JSON.stringify(makeCard(i))+'\n');
console.log('Designed 20 functional Fabric student card templates.');
