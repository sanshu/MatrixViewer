/**
 * @author Mayya Sedova <msedova.dev@gmail.com>
 */
//var clusterfck = require("clusterfck");

function MatrixViewer(parentId) {
    d3.select(parentId).html('<div class="row px-3" style="width:100%" id="_matrixview">' + this.selectHTML + this.colorHTML + this.alertHTML + '</div>' + this.cmHTML + this.tooltipHTML);
    this.hideAlert();
    this._parentId = parentId;
}

MatrixViewer.prototype.selectHTML = '<p>Order by: <select id="order"> ' +
    ' <option value="rmsd">RMSD</option>' +
    ' <option value="name">PDB ID</option>' +
    ' <option value="group">cluster (k-means)</option>' +
    ' <option value="hcluster">cluster (hierarchical)</option>' +
    '     </select>';
MatrixViewer.prototype.colorHTML = '<p>Color by: <select id="color"> ' +
    ' <option value="rmsd">RMSD</option>' +
    ' <option value="cluster">cluster id (k-means)</option>' +
    '     </select>';
MatrixViewer.prototype.alertHTML = '<div class="alert alert-light col-6" role="alert" ' +
    'id="alertbox">&nbsp;</div>'
MatrixViewer.prototype.cmHTML = '<div class="row"><div class="col-12"><matrix id="matrix"></matrix></div>';
MatrixViewer.prototype.tooltipHTML = '<div id="tooltip" class="hidden">' +
    '<p><span id="value"></p>' +
    '</div></div>';

MatrixViewer.prototype.clear = function () {
    this.hideAlert();
    this._width = 0;
    this.data = null;
    d3.select('matrix').select('svg').remove();
    d3.select('matrix').select('*').remove();
};

MatrixViewer.prototype.alert = function (text) {
    d3.select('#alertbox').html(text);
};


MatrixViewer.prototype.hideAlert = function () {
    d3.select('#alertbox').html('');
};


MatrixViewer.prototype._parse = function (json) {
    var data = json.matrix; // original data as text

    var numClusters = json.numClusters || 3;
//    console.log(data);
    /* input matrix should have format:
     * column 1 PDB1
     * column 2 PDB2
     * column 3 contact
     * column 4 RMSD
     */

    try {
        var pdbs = [];  // all pdbs in matrix; {id, index, group}
        var dsv = d3.dsvFormat('\t');

        var links = [];
        var nodeset = {};

        var ni = 0; // node index counter


        var rmsdMatrix = []; // matrix with rmsd values for clustering

        var dataArray = dsv.parseRows(data, function (d, i) {
            // d is array
//            console.log(d);
            var n1, n2,
                pdb1 = d[0],
                pdb2 = d[1],
                contact = parseFloat(d[2]),
                value = parseFloat(d[3]);

            n1 = nodeset[pdb1];

            if (!n1) {
                //need to create new node
                ni = pdbs.length;
                n1 = {name: pdb1, index: ni};
                nodeset[pdb1] = n1;
                pdbs.push(n1);

                rmsdMatrix[n1.index] = rmsdMatrix[n1.index] || [];
                rmsdMatrix[n1.index][n1.index] = 0;
            }

            n2 = nodeset[pdb2];

            if (!n2) {
                //need to create new node
                ni = pdbs.length;
                n2 = {name: pdb2, index: ni};
                nodeset[pdb2] = n2;
                pdbs.push(n2);
                rmsdMatrix[n2.index] = rmsdMatrix[n2.index] || [];
                rmsdMatrix[n2.index][n2.index] = 0;
            }

            rmsdMatrix[n1.index][n2.index] = value;
            rmsdMatrix[n2.index][n1.index] = value;

            links.push({source: n1.index, target: n2.index, value: value});

            return {pdb1: pdb1, pdb2: pdb2, contact: contact, rmsd: value};
        });
//        console.log(pdbs);
//        console.log(links);
//
        console.log('Data parsed.');

        links = this.clusterKmeans(links, numClusters);

        var hclusters = this.hcluster(rmsdMatrix);



        return {matrix: dataArray, pdbs: pdbs, links: links, hclusters: hclusters};
    } catch (e) {
        console.log(e);
        this.alert('Wrong input format. Required format: [PDB1 PDB2 contact RMSD]');
        return null;
    }
}

/**
 * Performs hierarchical clustering and ordering of elements.
 * Returns array of element indices in original data
 * @param {type} data
 * @return {Array|MatrixViewer.prototype.hcluster.order}
 */
MatrixViewer.prototype.hcluster = function (data) {
    // clusterfck needs 2d array of values


    function children(d) {
//        console.log(d);
        var l = d.left || null,
            r = d.right || null,
            res = [];
        l && res.push(l);
        r && res.push(r);

        if (res.length > 0) {
            return res;
        }
        return null;
    }
//    console.log(data[0]);

    var clusters = clusterfck.hcluster(data);
//    console.log('hclusters');
//    console.log(clusters[0]);

    var tree = d3.hierarchy(clusters[0], children);
    var tree1 = d3.cluster();
    tree1(tree);

    // now leaves are ordered by cluster id
    var leaves = tree.leaves();

    // will keep index of element in original data here
    var order = [];

    leaves.forEach(function (leaf) {
        var d = leaf.data.canonical; // original row from matrix
        var i = data.indexOf(d);
        order.push(i);
    });
    console.log('Data clustered (hierarchical)');
    console.log(order);

    return order;
};

MatrixViewer.prototype.clusterKmeans = function (data, numClusters) {
    var clusters = d3.kmeans(data, numClusters, function (d) {
        return d.value;
    });
    // assing group values for each data element
    var result = new Array();

    clusters.forEach(function (group, g) {
        group.forEach(function (d, i) {
            d.group = g + 1;
        });

        result = result.concat(group);
    });
    console.log('Data clustered (k-means).');
    return result;

};

MatrixViewer.prototype.draw = function (json) {
    this.clear();
    console.log('View cleared.');

    if (json === null) {
        this.alert('Input data is empty.');
        return;
    }

    var pleft = parseInt(d3.select(this._parentId).style('padding-left')),
        pright = parseInt(d3.select(this._parentId).style('padding-right'));
    this._width = parseInt(d3.select(this._parentId).style('width'))
        - pleft - pright - 15; // little less than inner width of parent element

    this.data = this._parse(json);
    console.log(this.data);
    if (this.data !== null) {
        this._draw();
    }

    var sel = document.getElementById('color');
    sel.options[0].selected = true;
    sel.dispatchEvent(new Event('change'));

    sel = document.getElementById('order');
    sel.options[0].selected = true;
    sel.dispatchEvent(new Event('change'));

}; // end of draw()


MatrixViewer.prototype._draw = function () {
    console.log('Drawing.');
    var self = this;
    var nodes = self.data.pdbs;
    var margin = {
        top: 150,
        right: 50,
        bottom: 10,
        left: 50,
        legend: {
            top: -100,
            left: 10,
            width: 50,
            height: 50
        }
    },
        width = 700, //this._width || 700,
        height = 700, //width + margin.legend.top + margin.legend.height,
        innerWidth = width - margin.left - margin.right - margin.legend.left - margin.legend.width
        ;

    var svg = d3.select('matrix').append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    svg.append('rect')
        .attr('class', 'background')
        .attr('width', width)
        .attr('height', height);

    var matrix = [];
    var numNodes = nodes.length;
    var maxRMSD = d3.max(self.data.links, function (d) {
        return d.value;
    });
    var matrixScale = d3.scaleBand().range([0, width]).domain(d3.range(numNodes));
    var colorScaleCluster = d3.scaleOrdinal(d3.schemeCategory10);

    var colorScaleRMSD = d3.scaleSequential(d3.interpolateYlGnBu);
    var colorScale = colorScaleRMSD;

// Create rows for the matrix
    nodes.forEach(function (node) {
        matrix[node.index] = d3.range(numNodes).map(i => {
            return {
                x: i,
                y: node.index,
                z: 0
            };
        });
    });

    // Fill matrix with data from links and count how many times each item appears
    self.data.links.forEach(function (link) {
        matrix[link.source][link.target].z += link.value;
        matrix[link.target][link.source].z += link.value;


        matrix[link.source][link.target].group = link.group;
        matrix[link.target][link.source].group = link.group;
    });

    // Draw each row (translating the y coordinate)
    var rows = svg.selectAll('.row')
        .data(matrix)
        .enter().append('g')
        .attr('class', 'row')
        .attr('transform', (d, i) => {
            return 'translate(0,' + matrixScale(i) + ')';
        });

    var squares = rows.selectAll('.cell')
        .data(d => d.filter(item => item.z > 0))
        .enter().append('rect')
        .attr('class', 'cell')
        .attr('x', d => matrixScale(d.x))
        .attr('width', matrixScale.bandwidth())
        .attr('height', matrixScale.bandwidth())
        .style('fill', d => {
            return colorScale(d.group)//nodes[d.x].group == nodes[d.y].group ? colorScale(nodes[d.x].group) : "grey";
        })
        .on('mouseover', mouseover)
        .on('mouseout', mouseout);

    var columns = svg.selectAll('.column')
        .data(matrix)
        .enter().append('g')
        .attr('class', 'column')
        .attr('transform', (d, i) => {
            return 'translate(' + matrixScale(i) + ')rotate(-90)';
        });

    rows.append('text')
        .attr('class', 'label')
        .attr('x', -5)
        .attr('y', matrixScale.bandwidth() / 2)
        .attr('dy', '.32em')
        .attr('text-anchor', 'end')
        .text((d, i) => nodes[i].name);

    columns.append('text')
        .attr('class', 'label')
        .attr('y', 100)
        .attr('y', matrixScale.bandwidth() / 2)
        .attr('dy', '.32em')
        .attr('text-anchor', 'start')
        .text((d, i) => nodes[i].name);


    legend('Cluster id', colorScale);

    // Precompute the orders.
    var orders = {
        name: d3.range(numNodes).sort((a, b) => {
            return d3.ascending(nodes[a].name, nodes[b].name);
        }),
        group: d3.range(numNodes).sort((a, b) => {
            a = Math.min(numNodes - 2, a);
            b = Math.min(numNodes - 2, b);
            var group1 = matrix[a][a + 1].value;
            var group2 = matrix[b][b + 1].value;

            return group1 - group2;
//            return nodes[a].group - nodes[b].group;
        }),
        rmsd: d3.range(numNodes).sort((a, b) => {
//            a = Math.min(numNodes - 2, a);
//            b = Math.min(numNodes - 2, b);

            var group1 = matrix[1][a].z;
            var group2 = matrix[1][b].z;
            if (group1 != group2)
                return group1 - group2;
            // extra sorting
            var group1 = matrix[numNodes - 1][a].z;
            var group2 = matrix[numNodes - 1][b].z;
            return group1 - group2;
        }),
        hcluster: self.data.hclusters
    };

    d3.select('#order').on('change', function () {
        changeOrder(this.value);
    });
    d3.select('#color').on('change', function () {
        changeColor(this.value);
    });
    function changeOrder(value) {
        matrixScale.domain(orders[value]);
        var t = svg.transition().duration(2000);

        t.selectAll('.row')
            .delay((d, i) => matrixScale(i) * 4)
            .attr('transform', function (d, i) {
                return 'translate(0,' + matrixScale(i) + ')';
            })
            .selectAll('.cell')
            .delay(d => matrixScale(d.x) * 4)
            .attr('x', d => matrixScale(d.x));

        t.selectAll('.column')
            .delay((d, i) => matrixScale(i) * 4)
            .attr('transform', (d, i) => 'translate(' + matrixScale(i) + ')rotate(-90)');
    }

    function changeColor(value) {
        if (value === 'rmsd') {
            colorScale = colorScaleRMSD;
            svg.selectAll('.cell')
                .transition()
                .style('fill', function (d) {
                    var v = d.z;
                    return colorScale(d.z);
                });

            legend('RMSD', colorScale);
        } else {
            colorScale = colorScaleCluster;

            svg.selectAll('.cell')
                .transition()
                .style('fill', function (d) {
                    return colorScale(d.group);
                });

            legend('Cluster id', colorScale);
        }
    }

    var legendGroup;
    function legend(title, colors) {
        return;
        legendGroup && legendGroup.remove();
        var colorLegend = d3.legendColor()
            .title(title)
            .labelFormat(d3.format('.1f'))
            .shapeWidth(30)
            .scale(colors)
            .orient('horizontal')
            .labelOffset(12);

        legendGroup = svg.append('g')
            .attr('transform', 'translate(' + margin.legend.left + ',' + margin.legend.top + ')')
            .call(colorLegend);
    }

    rows.append('line')
        .attr('x2', width);

    columns.append('line')
        .attr('x1', -width);

    var tooltip = d3.select('body')
        .append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);


    function mouseover(p) {
        d3.selectAll('.row text').classed('active', (d, i) => {
            return i == p.y;
        });
        d3.selectAll('.column text').classed('active', (d, i) => {
            return i == p.x;
        });
        tooltip.transition().duration(200).style('opacity', .9);
        var group = matrix[p.x][p.y].group;
        tooltip.html(
            nodes[p.y].name + '<br>' +
            nodes[p.x].name + '<br>[ cluster' + group + ']</br>RMSD: ' +
            p.z)
            .style('left', (d3.event.pageX + 30) + 'px')
            .style('top', (d3.event.pageY - 50) + 'px');

    }

    function mouseout() {
        d3.selectAll('text').classed('active', false);
        tooltip.transition().duration(500).style('opacity', 0);
    }

    return;

};
