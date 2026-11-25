import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = process.cwd();
const samplesDir = path.join(root, 'samples');

const lectures = [
  {
    folder: 'neural-networks',
    file: 'Lecture 1 - Perceptron and Backpropagation.pdf',
    footer: 'Neural Networks - Lecture 1',
    pages: [
      {
        heading: '1.1 Perceptron model',
        paragraphs: [
          'The perceptron is the simplest trainable neuron model. It computes a weighted sum of input features and adds a bias term. The result is passed through an activation function to produce a binary output.',
          'A perceptron can separate linearly separable data, but it cannot solve XOR. The decision boundary is a hyperplane defined by the weights and the bias. Training adjusts those parameters when a prediction is wrong.',
          'The perceptron learning rule updates each weight by adding the product of the learning rate, the error, and the input value. The perceptron is therefore trained by repeated error-correcting updates rather than by a closed-form solution.',
        ],
      },
      {
        heading: '1.2 Activation functions',
        paragraphs: [
          'Activation functions introduce non-linearity into a neural network. The sigmoid function squashes a real value between zero and one, which makes it useful for probabilities but can cause vanishing gradients in deep networks.',
          'ReLU returns the input when it is positive and zero otherwise. It is cheap to compute and often trains faster than sigmoid, but inactive units can stop receiving gradients. Leaky ReLU keeps a small negative slope to reduce that risk.',
          'The choice of activation function changes the shape of the loss surface. Output activation is selected for the task: sigmoid for binary classification, softmax for mutually exclusive classes, and linear output for regression.',
        ],
      },
      {
        heading: '1.3 Backpropagation',
        paragraphs: [
          'Backpropagation computes the gradient of a loss function with respect to every weight using the chain rule. Gradients flow backward from the output layer to the input layer.',
          'A training step has four parts: a forward pass, a loss computation, a backward pass, and a gradient descent update. Mini-batch stochastic gradient descent estimates the gradient from a small sample of examples.',
          'Backpropagation can suffer from vanishing or exploding gradients. Normalised initialisation, batch normalisation, residual connections, and gradient clipping are common remedies. The learning rate controls the size of each update.',
        ],
      },
    ],
  },
  {
    folder: 'neural-networks',
    file: 'Lecture 2 - Convolutional Neural Networks.pdf',
    footer: 'Neural Networks - Lecture 2',
    pages: [
      {
        heading: '2.1 Convolution layer',
        paragraphs: [
          'A convolution layer slides learnable filters over an input image. Each filter computes a dot product at every spatial position and produces a feature map that records where a local pattern occurs.',
          'Stride controls how far the filter moves at each step. Padding controls the spatial size of the output and preserves border information. A larger receptive field lets deeper layers detect more global structure.',
          'Convolutional weight sharing greatly reduces the number of parameters compared with a fully connected layer. The same edge detector can be reused at every image location.',
        ],
      },
      {
        heading: '2.2 Pooling layer',
        paragraphs: [
          'Pooling reduces the spatial resolution of feature maps. Max pooling keeps the strongest activation in each window, while average pooling reports the mean activation.',
          'Pooling provides small translation invariance and lowers computation in later layers. It has no learnable parameters, although the window size and stride are design choices.',
          'Global average pooling collapses each feature map to one number before the classifier. This is common in modern CNN architectures and reduces overfitting in the final dense layers.',
        ],
      },
      {
        heading: '2.3 CNN architectures',
        paragraphs: [
          'LeNet established the pattern of convolution, pooling, and fully connected layers for digit recognition. AlexNet increased depth and used ReLU with dropout. VGG showed that repeated small filters can build deep networks.',
          'ResNet introduced skip connections so that gradients can bypass a block. This makes very deep networks easier to optimise. Batch normalisation stabilises activations during training.',
          'Data augmentation, dropout, early stopping, and transfer learning are standard controls against overfitting. Evaluation should use a held-out test set that was never used for tuning.',
        ],
      },
    ],
  },
  {
    folder: 'data-science',
    file: 'Lecture 1 - Data Cleaning and Exploratory Analysis.pdf',
    footer: 'Data Science - Lecture 1',
    pages: [
      {
        heading: '1.1 Missing values',
        paragraphs: [
          'Missing data can be classified as missing completely at random, missing at random, or missing not at random. The mechanism matters because it determines whether deletion introduces bias.',
          'Listwise deletion removes an entire row when any field is missing. Mean or median imputation preserves the row count but shrinks variance. Multiple imputation models the uncertainty of each missing value.',
          'Always report how many values were missing and which method was used. A cleaning decision that is invisible in the final dataset cannot be audited by a reader.',
        ],
      },
      {
        heading: '1.2 Outlier detection',
        paragraphs: [
          'The interquartile range rule flags values below the first quartile minus 1.5 times the IQR or above the third quartile plus 1.5 times the IQR. It is robust to extreme values.',
          'A z-score flags observations that are many standard deviations from the mean, but the mean and standard deviation are themselves sensitive to outliers. Domain knowledge should decide whether an unusual value is an error or a real event.',
          'Outliers should not be deleted automatically. Investigate the measurement process, document the decision, and test whether conclusions change when the value is retained or excluded.',
        ],
      },
      {
        heading: '1.3 Exploratory plots',
        paragraphs: [
          'Histograms show the shape of one variable. Boxplots compare distributions across groups and expose outliers. Scatterplots reveal relationships and clusters between two variables.',
          'Exploratory analysis is iterative. A surprising plot should lead to a focused question, not an immediate model. Correlation does not establish causation, especially when a confounder is unobserved.',
          'Plots should have labelled axes, readable scales, and a caption that states the sample size. Avoiding chart junk makes patterns easier to compare and supports reproducibility.',
        ],
      },
    ],
  },
];

function wrap(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word;
    } else if ((line + ' ' + word).length <= maxChars) {
      line += ' ' + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function makeLecture(lecture) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.09, 0.13, 0.18);
  const muted = rgb(0.38, 0.42, 0.48);
  const accent = rgb(0.05, 0.45, 0.42);

  lecture.pages.forEach((pageData, index) => {
    const page = document.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.985, 0.98, 0.955) });
    page.drawRectangle({ x: 48, y: 735, width: 516, height: 3, color: accent });
    page.drawText(lecture.footer, { x: 48, y: 750, size: 10, font: regular, color: muted });
    page.drawText(pageData.heading, { x: 48, y: 690, size: 24, font: bold, color: dark });
    let y = 645;
    for (const paragraph of pageData.paragraphs) {
      for (const line of wrap(paragraph, 88)) {
        page.drawText(line, { x: 48, y, size: 11.5, font: regular, color: dark });
        y -= 17;
      }
      y -= 12;
    }
    page.drawText(`Page ${index + 1}`, { x: 515, y: 36, size: 9, font: regular, color: muted });
    page.drawText(lecture.footer, { x: 48, y: 36, size: 9, font: regular, color: muted });
  });

  document.setTitle(lecture.file.replace(/\.pdf$/i, ''));
  document.setAuthor('CourseAtlas sample material');
  const bytes = await document.save();
  const folder = path.join(samplesDir, lecture.folder);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, lecture.file), bytes);
  return path.join(folder, lecture.file);
}

async function makeScannedPdf() {
  const document = await PDFDocument.create();
  for (let index = 0; index < 2; index += 1) {
    const page = document.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.94, 0.94, 0.94) });
    page.drawRectangle({ x: 70, y: 120, width: 472, height: 560, color: rgb(0.82, 0.82, 0.82) });
    page.drawRectangle({ x: 94, y: 144, width: 424, height: 512, color: rgb(0.89, 0.89, 0.89) });
  }
  const bytes = await document.save();
  const target = path.join(samplesDir, 'scanned-image-only.pdf');
  fs.writeFileSync(target, bytes);
  return target;
}

fs.mkdirSync(samplesDir, { recursive: true });
const made = [];
for (const lecture of lectures) {
  made.push(await makeLecture(lecture));
}
made.push(await makeScannedPdf());
for (const file of made) {
  console.log(`wrote ${path.relative(root, file)}`);
}
