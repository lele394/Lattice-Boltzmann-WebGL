# Lattice-Boltzmann WebGL



<p align="center">
  <img src="./res/cow.gif" width="50%">
</p>


> #### Clarification on AI use in this project :
> Having some experience of working with LLM in computational science for the past few years, it has become increasingly obvious that they are not to be trusted in physics related domains. In contrast, it's ability to quickly add JS and HTML elements has been found to be quite reliable. As such, AI has been used through Copilot to help in debugging and commenting as well as add HTML and JS features. It has **not** been used to implement the physics simulation.


This is my own little implementation of a Lattice-Boltzmann simulation in WebGL


## FAQ

> #### why?
> Because it looks cool, and it makes cool graphs, that's why.

> #### Can I try it?
> Yes, I should have setup a Github Pages for it. Check the about section of the repo

> #### Is there videos of it?
> Yes, there is a [Youtube Playlist](https://www.youtube.com/playlist?list=PLbVMHgx1jRJ25z9HuNSBwIXIyp2sq--8g) Where I'll occasionally put the cool stuff.

Just messing around with Lattice Boltzman simulation

WebGL cuz I wanna play with it online




### Ressources used

- [MRT Lattice Boltzmann Schemes for High Reynolds Number Flow in Two-Dimensional Lid-Driven Semi-Circular Cavity](https://www.researchgate.net/publication/270955554_MRT_Lattice_Boltzmann_Schemes_for_High_Reynolds_Number_Flow_in_Two-Dimensional_Lid-Driven_Semi-Circular_Cavity)

- Gábor Závodszky's [medFlow2 Lattice-Boltzmann code](https://github.com/gzavo/medFlow2D/blob/master/src/lbm/lb.c)

- for the tunnel and open system boundaries (Zou/He boundaries) : [Implementation of on-site velocity boundary conditions for D3Q19 lattice Boltzmann](https://arxiv.org/abs/0811.4593)

- Insane paper : [On single distribution lattice Boltzmann schemes for the approximation of Navier Stokes equations](https://arxiv.org/html/2206.13261v4)


### Features

- WebGL-based D2Q9 Lattice-Boltzmann fluid simulation
- Real-time visualization with density and velocity field rendering
- Multiple boundary conditions: Wrap Around, Boundary Walls, Open System, Airflow Tunnel
- MRT (Multiple Relaxation Time) collision operator with adjustable relaxation spectrum
- Interactive wall objects: Circle, Rectangle, Triangle, Aerospike, Four Circles, Moving Vertical Bar, Custom Bitmap
- Two initialization modes: Ink Drop and Uniform density
- Adjustable visualization parameters: color range calibration, power stretch, zone of interest selection
- Hover info display with D2Q9 distribution values at cursor position
- Video recording support (WebM and GIF formats)
- Configurable canvas dimensions and simulation step rate
- Settings persistence using browser local storage
- Collapsible control panel with real-time parameter adjustment