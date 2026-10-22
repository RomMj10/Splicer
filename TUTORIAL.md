<h1 align="center">Tutorial</h1>

## How it works?
Upload a valid file first. You may use two methods: Upload button at the right top corner OR simply drag the image. You can only import valid image files (PNG, JPEG, etc..)
<img  alt="image" src="https://github.com/user-attachments/assets/c81a9141-5f0a-44c5-adeb-cd6da29f2588" />

After uploading your file, you can adjust your cell slices on the left-side of the screen

<img  alt="image" src="https://github.com/user-attachments/assets/547d8e23-aa71-4763-bf5b-89511d55410e" />


### Slice settings
The first setting you see from the sidebar is the slicing <b>Type</b>. There are currently `3` types of slicing methods for now.

`Grid by cell count` - Slices cell automatically based on number of columns and rows

`Grid by cell size` - Slices cells based on its size; You can adjust the cell size using the two fields, width and height. The size are measured on pixels

`Custom` - Slice a cell with your mouse; You can resize or delete the selected cell after slicing it


`Offset X & Y` - Adjust your slice position; adding more X, goes right, while adding Y means the slices move down

`Padding` - Add border/space between your slices

`Name Prefix` - What name prefix would they add when slicing your images?; example: `block_texture_atlas` was named, then the slices will contain those along with their index number. Very useful when you have a certain naming convention in mind
<img  alt="image" src="https://github.com/user-attachments/assets/83094ce5-2279-448c-8fb4-e9963b00f5be" />

`Skip fully transparent cells` - looks for non-transparent pixels inside the cell. If there's none, skipped it!

`Anti-Aliasing lines` - [Optional] You may see blurry/smoothed grid lines if enabled

## Exporting
After uploading your image and successfully sliced all cells, you have option to export all those slices bundled in Zip. You can also rename individual images before exporting them!

*Example: I want to export my block textures based on their names, you can do that by clicking their names on the field and edit the values*
<p align="center">
  <img  alt="image" src="https://github.com/user-attachments/assets/4c522cf3-2c1c-4a68-978f-9c96e403a36f" />
</p>


If you want your images to appear sharper, you may adjust the scale of the image using the scale option at the topbar. The scale ranges from 0.5x to 4x of its resolution. This setting is useful if you want to export those images and import to other platforms

<p align="center">
<img  alt="image" src="https://github.com/user-attachments/assets/99e0514f-57d0-49b0-9217-6c3d72025516" />
</p>

### Batch selection
To edit multiple files, first you need to select the first slice. Then hold shift and click another slice. The list will highlight multiple slices and this lets you delete them together or rename the selected batch. Use ctrl+click instead to select specific slices

<p align="center">
<img alt="image" src="https://github.com/user-attachments/assets/bf5e3c7a-1b2b-4e85-9ed2-159a0d6cc282" />
</p>

Alternatively, you can select sliced cells at the canvas when you are having a hard time searching it inside the list

<p align="center">
<img alt="image" src="https://github.com/user-attachments/assets/7ce54bd2-a870-44fd-be32-3ce69703fc69" />
</p>
