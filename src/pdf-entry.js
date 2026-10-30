// Loaded on demand when someone saves or shares a document as PDF.
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
window.html2canvas = html2canvas;
window.jspdf = { jsPDF };
